import { verifyToken } from '../middleware/auth.js';
import { Patient } from '../models/index.js';
import {
  ingest,
  ingestVisionAlerts,
  setEmitter,
  snapshot,
  startMonitorLoop,
} from '../monitor/runner.js';

/**
 * The telemetry plane.
 *
 * Two room families:
 *   patient:<id>   — everyone looking at one patient (the patient's own kiosk
 *                    plus any nurse who has their monitor page open)
 *   station:<ward> — every nurse watching a ward board
 *
 * Alerts go to both: the ward board must light up even when nobody has that
 * patient's page open, which is the normal case at 3am.
 */

const patientRoom = (id) => `patient:${id}`;
const stationRoom = (ward) => `station:${ward}`;

export function attachTelemetry(io) {
  const ns = io.of('/telemetry');

  ns.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('missing token'));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('invalid token'));
    }
  });

  // Alerts are raised deep inside the monitor loop, which knows nothing about
  // sockets. This is the one seam between them.
  setEmitter((monitor, event, payload, meta) => {
    ns.to(patientRoom(monitor.patientId)).emit(event, { ...payload, ...meta });
    ns.to(stationRoom(monitor.wardId)).emit(event, { ...payload, ...meta });
  });

  ns.on('connection', (socket) => {
    const { role, patient: patientId, sub: userId, name } = socket.user;

    if (role === 'patient' && patientId) {
      socket.join(patientRoom(patientId));
      announcePresence(ns, patientId, { online: true });

      socket.on('reading:frame', async ({ samples } = {}) => {
        if (!Array.isArray(samples) || !samples.length) return;
        try {
          const result = await ingest(patientId, samples);
          if (!result) return;
          // Fan the raw readings out to whoever is watching. This is what the
          // nurse's VitalsWall canvas renders — and therefore what MediaPipe
          // ends up reading back out of the pixels.
          ns.to(patientRoom(patientId)).emit('vitals:frame', {
            patient: patientId,
            samples,
            latest: result.latest,
            score: result.score,
          });
          // The ward board gets the summary only; six samples a second per
          // patient across a whole ward would be pointless traffic.
          ns.to(stationRoom(result.wardId)).emit('vitals:summary', {
            patient: patientId,
            latest: result.latest,
            score: result.score,
            ts: Date.now(),
          });
        } catch (err) {
          console.error('[telemetry] ingest failed', err.message);
        }
      });

      socket.on('camera:state', ({ live }) => {
        ns.to(patientRoom(patientId)).emit('camera:state', { patient: patientId, live });
      });

      socket.on('disconnect', () => announcePresence(ns, patientId, { online: false }));
      return;
    }

    // ---- nurse / admin ----
    socket.on('subscribe:station', async ({ wardId }) => {
      if (!wardId) return;
      socket.join(stationRoom(wardId));
    });

    socket.on('subscribe:patient', async ({ patientId: id }) => {
      if (!id) return;
      socket.join(patientRoom(id));
      // Hand over the current state immediately, so a nurse opening a monitor
      // page sees a populated screen rather than waiting a second for the next
      // frame to arrive.
      const snap = snapshot(id);
      if (snap) socket.emit('vitals:snapshot', { patient: id, ...snap });
    });

    socket.on('unsubscribe:patient', ({ patientId: id }) => {
      if (id) socket.leave(patientRoom(id));
    });

    /**
     * Alerts the nurse-side MediaPipe detector raised from the pixels of the
     * vitals stream. They are persisted alongside the server's own so the feed
     * shows the same event found two independent ways.
     */
    socket.on('vision:alerts', async ({ patientId: id, events }) => {
      if (!id || !Array.isArray(events) || !events.length) return;
      try {
        await ingestVisionAlerts(id, events);
      } catch (err) {
        console.error('[telemetry] vision alert failed', err.message);
      }
    });

    /** The camera is off by default; this is the nurse asking for it. */
    socket.on('camera:request', ({ patientId: id }) => {
      if (!id) return;
      ns.to(patientRoom(id)).emit('camera:request', {
        patient: id,
        by: { id: userId, name },
        ts: Date.now(),
      });
    });

    socket.on('camera:cancel', ({ patientId: id }) => {
      if (id) ns.to(patientRoom(id)).emit('camera:cancel', { patient: id });
    });
  });

  startMonitorLoop();
  return ns;
}

async function wardOf(patientId) {
  const p = await Patient.findById(patientId).select('wardId').lean();
  return p?.wardId;
}

async function announcePresence(ns, patientId, state) {
  const wardId = await wardOf(patientId);
  const payload = { patient: patientId, ...state, ts: Date.now() };
  ns.to(patientRoom(patientId)).emit('patient:presence', payload);
  if (wardId) ns.to(stationRoom(wardId)).emit('patient:presence', payload);
}
