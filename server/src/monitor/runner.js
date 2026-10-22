import { createDetector } from '@vitalwatch/shared/detector.js';
import { METRIC_ORDER } from '@vitalwatch/shared/metrics.js';
import { Alert, Patient, Reading } from '../models/index.js';

/**
 * The 24/7 monitoring loop.
 *
 * This is the path that does not depend on anyone watching. It holds one
 * detector per patient, fed straight from the telemetry socket, and it owns
 * alert persistence. The nurse browser runs the same detector over the numbers
 * MediaPipe reads off the vitals stream, but if every browser in the building
 * is closed, this is what still catches a desaturation at 04:00.
 */

/** How long an unacknowledged alert may sit before it escalates. */
const SLA_MINUTES = { critical: 5, warning: 15, info: 60 };

/** Samples kept in memory per metric — 30 minutes at 1 Hz. */
const RING_SIZE = 1800;

/** Detectors idle this long are dropped, so a discharged patient frees memory. */
const IDLE_EVICT_MS = 30 * 60 * 1000;

/** A condition returning inside this window is the same one flapping. */
const FLAP_WINDOW_MS = 10 * 60 * 1000;

const monitors = new Map();

let emit = () => {};
/** Injected by realtime/telemetry.js so this module stays free of socket.io. */
export function setEmitter(fn) {
  emit = fn;
}

async function createMonitor(patientId) {
  const patient = await Patient.findById(patientId).lean();
  if (!patient) return null;

  const detector = createDetector({ overrides: patient.thresholds });
  detector.setContext({
    onOxygen: patient.onOxygen,
    consciousness: patient.consciousness,
  });

  return {
    patientId: String(patientId),
    wardId: patient.wardId,
    detector,
    /** metric -> [{ value, value2, ts }] */
    ring: Object.fromEntries(METRIC_ORDER.map((m) => [m, []])),
    pendingWrites: [],
    lastSeen: Date.now(),
  };
}

export async function getMonitor(patientId) {
  const id = String(patientId);
  let m = monitors.get(id);
  if (!m) {
    m = await createMonitor(id);
    if (!m) return null;
    monitors.set(id, m);
  }
  return m;
}

/**
 * Ingest a batch of readings from a patient device.
 * @returns {Promise<{latest:object, score:object, alerts:object[]}>}
 */
export async function ingest(patientId, samples) {
  const m = await getMonitor(patientId);
  if (!m) return null;
  m.lastSeen = Date.now();

  const events = [];
  for (const s of samples) {
    if (!METRIC_ORDER.includes(s.metric)) continue;
    const ts = typeof s.ts === 'number' ? s.ts : Date.parse(s.ts);
    const sample = { metric: s.metric, value: s.value, value2: s.value2, ts };

    const ring = m.ring[s.metric];
    ring.push({ value: s.value, value2: s.value2, ts });
    if (ring.length > RING_SIZE) ring.shift();

    m.pendingWrites.push({
      patient: m.patientId,
      metric: s.metric,
      value: s.value,
      value2: s.value2,
      ts: new Date(ts),
    });

    events.push(...m.detector.push(sample));
  }

  await flushWrites(m);
  const alerts = await applyEvents(m, events);

  return {
    wardId: m.wardId,
    latest: m.detector.latest(),
    score: m.detector.score(),
    alerts,
  };
}

/**
 * Telemetry arrives at 1 Hz per metric — six inserts a second per patient. One
 * batched insertMany per flush keeps that off the hot path entirely.
 */
async function flushWrites(m) {
  if (m.pendingWrites.length < 6) return;
  const batch = m.pendingWrites;
  m.pendingWrites = [];
  try {
    await Reading.insertMany(batch, { ordered: false });
  } catch (err) {
    console.error('[monitor] reading write failed', err.message);
  }
}

/** Turn detector events into persisted, broadcast alerts. */
async function applyEvents(m, events, source = 'server') {
  const out = [];
  for (const e of events) {
    const { alert } = e;
    if (e.action === 'clear') {
      // An alert that resolves itself is recorded as resolved rather than
      // deleted — the nurse still needs to see that it happened.
      const updated = await Alert.findOneAndUpdate(
        { patient: m.patientId, dedupeKey: alert.key, status: { $ne: 'resolved' }, source },
        { status: 'resolved', resolvedAt: new Date(alert.clearedAt ?? Date.now()) },
        { new: true },
      ).lean();
      if (updated) {
        out.push(updated);
        emit(m, 'alert:update', updated);
      }
      continue;
    }

    const doc = {
      patient: m.patientId,
      dedupeKey: alert.key,
      kind: alert.kind,
      metric: alert.metric,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      value: alert.value,
      value2: alert.value2,
      source,
      slaMinutes: SLA_MINUTES[alert.severity],
    };

    if (e.action === 'escalate') {
      // Escalation updates the alert in place. A nurse who already acknowledged
      // a warning must see it reopen when it turns critical, so status resets.
      const updated = await Alert.findOneAndUpdate(
        { patient: m.patientId, dedupeKey: alert.key, status: { $ne: 'resolved' }, source },
        { ...doc, status: 'open', acknowledgedAt: null, acknowledgedBy: null },
        { new: true },
      ).lean();
      if (updated) {
        out.push(updated);
        emit(m, 'alert:update', updated, { escalated: true });
        continue;
      }
      // Nothing open to escalate (a restart, say) — fall through and raise it.
    }

    /**
     * Upsert, not create. The detector will not re-raise an alert it is
     * already holding open, but there can be more than one detector for the
     * same patient — a second nurse station, a restart, a reconnect — and each
     * legitimately raises once. Keying on (patient, dedupeKey, source) means
     * that becomes one alert rather than one per observer.
     */
    const existing = await Alert.findOneAndUpdate(
      { patient: m.patientId, dedupeKey: alert.key, source, status: { $ne: 'resolved' } },
      {
        $set: { value: alert.value, value2: alert.value2, body: alert.body },
        $inc: { occurrences: 1 },
        $currentDate: { lastOccurredAt: true },
      },
      { new: true },
    ).lean();
    if (existing) {
      out.push(existing);
      continue;
    }

    /**
     * A condition that resolved moments ago and came straight back is the same
     * condition flapping, not a new event. Reopening the alert keeps one row
     * with a rising occurrence count; without this, a reading sitting on a
     * threshold produces a new alert every few seconds until the feed is
     * useless and every real alert is buried.
     */
    const recent = await Alert.findOneAndUpdate(
      {
        patient: m.patientId,
        dedupeKey: alert.key,
        source,
        status: 'resolved',
        resolvedAt: { $gte: new Date(Date.now() - FLAP_WINDOW_MS) },
      },
      {
        $set: { ...doc, status: 'open', resolvedAt: null, acknowledgedAt: null, acknowledgedBy: null },
        $inc: { occurrences: 1 },
        $currentDate: { lastOccurredAt: true },
      },
      { new: true, sort: { resolvedAt: -1 } },
    ).lean();
    if (recent) {
      out.push(recent);
      emit(m, 'alert:update', recent, { reopened: true });
      continue;
    }

    const created = await Alert.create({ ...doc, status: 'open' });
    const lean = created.toObject();
    out.push(lean);
    emit(m, 'alert:new', lean);
  }
  return out;
}

/**
 * Alerts raised by the nurse-side MediaPipe detector land here, so both
 * detectors write to the same feed and can be compared event for event.
 */
export async function ingestVisionAlerts(patientId, events) {
  const m = await getMonitor(patientId);
  if (!m) return [];
  return applyEvents(m, events, 'mediapipe');
}

export function snapshot(patientId) {
  const m = monitors.get(String(patientId));
  if (!m) return null;
  return {
    latest: m.detector.latest(),
    score: m.detector.score(),
    ring: m.ring,
    lastSeen: m.lastSeen,
  };
}

export function history(patientId, metric, sinceMs) {
  const m = monitors.get(String(patientId));
  if (!m) return [];
  const ring = m.ring[metric] || [];
  return sinceMs ? ring.filter((r) => r.ts >= sinceMs) : ring;
}

/**
 * The periodic sweep. Two jobs a stream of readings can never do on its own:
 * notice that readings have *stopped*, and notice that nobody has responded.
 */
export async function tick() {
  const now = Date.now();

  for (const [id, m] of monitors) {
    if (now - m.lastSeen > IDLE_EVICT_MS) {
      await flushWrites({ ...m, pendingWrites: m.pendingWrites });
      monitors.delete(id);
      continue;
    }
    const events = m.detector.tick(now);
    if (events.length) await applyEvents(m, events);
    // Flush whatever the batch threshold left behind, so a patient reporting
    // slowly still gets their readings persisted.
    if (m.pendingWrites.length) {
      const batch = m.pendingWrites;
      m.pendingWrites = [];
      await Reading.insertMany(batch, { ordered: false }).catch(() => {});
    }
  }

  await escalateOverdue(now);
}

/** Unacknowledged past its SLA — mark it and tell the ward again, louder. */
async function escalateOverdue(now) {
  const open = await Alert.find({ status: 'open', escalatedAt: null }).lean();
  for (const a of open) {
    if (!a.slaMinutes) continue;
    if (now - new Date(a.createdAt).getTime() < a.slaMinutes * 60_000) continue;

    const updated = await Alert.findByIdAndUpdate(
      a._id,
      { escalatedAt: new Date(now) },
      { new: true },
    ).lean();
    const m = monitors.get(String(a.patient));
    if (m) emit(m, 'alert:update', updated, { escalated: true });
  }
}

let timer = null;
export function startMonitorLoop(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error('[monitor] tick failed', err));
  }, intervalMs);
  timer.unref?.();
}

export function stopMonitorLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}
