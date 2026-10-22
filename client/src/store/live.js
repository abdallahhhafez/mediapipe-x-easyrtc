import { create } from 'zustand';
import { getSocket, on } from '../lib/socket';

/**
 * The live view of a ward: one entry per patient, updated by the telemetry
 * socket. Deliberately outside react-query — this is a stream, not a cache, and
 * it changes once a second per patient.
 */

const WINDOW_MS = 6 * 60 * 1000; // enough to back the default 5-minute charts

const latestAsSamples = (latest) =>
  Object.entries(latest ?? {})
    .filter(([, r]) => r)
    .map(([metric, r]) => ({ metric, value: r.value, value2: r.value2, ts: r.ts }));

export const useLive = create((set, get) => ({
  /** patientId -> { latest, score, online, lastSeen, series } */
  patients: {},
  alerts: [],
  cameraRequest: null,

  seed(patients) {
    set({
      patients: Object.fromEntries(
        patients.map((p) => [
          String(p._id),
          {
            latest: p.live?.latest ?? {},
            score: p.live?.score ?? null,
            lastSeen: p.live?.lastSeen ?? null,
            online: Boolean(p.live),
            alerts: p.alerts,
            series: {},
          },
        ]),
      ),
    });
  },

  seedAlerts(alerts) {
    set({ alerts });
  },

  /** Merge a summary (ward board) or a full frame (monitor page). */
  applyVitals(patientId, { latest, score, samples }) {
    const id = String(patientId);
    const prev = get().patients[id] ?? { series: {} };
    // A ward summary carries no raw samples — only the latest value per metric.
    // Appending those still builds a usable series, which is what the tile
    // sparklines draw from; the monitor page gets the full-rate samples.
    const series = appendSeries(prev.series, samples ?? latestAsSamples(latest));
    set({
      patients: {
        ...get().patients,
        [id]: { ...prev, latest, score, series, online: true, lastSeen: Date.now() },
      },
    });
  },

  applyPresence(patientId, online) {
    const id = String(patientId);
    const prev = get().patients[id];
    if (!prev) return;
    set({ patients: { ...get().patients, [id]: { ...prev, online } } });
  },

  upsertAlert(alert) {
    const alerts = get().alerts.slice();
    const i = alerts.findIndex((a) => a._id === alert._id);
    if (i >= 0) alerts[i] = { ...alerts[i], ...alert };
    else alerts.unshift(alert);
    set({ alerts });
  },

  setCameraRequest: (req) => set({ cameraRequest: req }),
}));

/**
 * Minimum spacing between charted points.
 *
 * A nurse with a monitor page open is subscribed to two rooms at once — the
 * ward board's and the patient's — and the server sends the same readings to
 * both, as a full `vitals:frame` and as a `vitals:summary`. Their timestamps
 * differ by milliseconds, so nothing looks duplicated, but every reading landed
 * on the chart twice: 592 points for 359 seconds of 1 Hz telemetry, and twice
 * the memory over a twelve-hour shift.
 *
 * Half the sample interval collapses that pair into one point whichever arrives
 * first, and drops any out-of-order straggler for free.
 */
const MIN_POINT_SPACING_MS = 500;

function appendSeries(series, samples) {
  if (!samples?.length) return series;

  const next = { ...series };
  const cutoff = Date.now() - WINDOW_MS;
  for (const s of samples) {
    const existing = next[s.metric] ?? [];
    const last = existing[existing.length - 1];
    if (last && s.ts - last.ts < MIN_POINT_SPACING_MS) continue;

    const list = existing.concat({ value: s.value, value2: s.value2, ts: s.ts });
    // Trimming on every frame keeps memory flat over a 12-hour shift, which is
    // the whole point of a monitoring station that never gets reloaded.
    let cut = 0;
    while (cut < list.length && list[cut].ts < cutoff) cut++;
    next[s.metric] = cut ? list.slice(cut) : list;
  }
  return next;
}

/** Wire the socket into the store once, at app level. */
export function attachLiveSocket() {
  getSocket();
  // A stable handle for the end-to-end checks. Importing this module from the
  // console gets a *different* instance under HMR — Vite serves it at a
  // versioned URL — so probes read an empty store and report nonsense.
  if (import.meta.env.DEV) window.__live = useLive;
  const store = useLive.getState();

  const offs = [
    on('vitals:summary', (p) => useLive.getState().applyVitals(p.patient, p)),
    on('vitals:frame', (p) => useLive.getState().applyVitals(p.patient, p)),
    on('vitals:snapshot', (p) => {
      useLive.getState().applyVitals(p.patient, p);
      // The snapshot carries the server's ring buffer, so a monitor page opens
      // with populated charts instead of drawing itself in over five minutes.
      if (p.ring) hydrateSeries(p.patient, p.ring);
    }),
    on('patient:presence', (p) => useLive.getState().applyPresence(p.patient, p.online)),
    on('alert:new', (a) => useLive.getState().upsertAlert(a)),
    on('alert:update', (a) => useLive.getState().upsertAlert(a)),
    on('camera:request', (r) => useLive.getState().setCameraRequest(r)),
    on('camera:cancel', () => useLive.getState().setCameraRequest(null)),
  ];

  void store;
  return () => offs.forEach((off) => off());
}

function hydrateSeries(patientId, ring) {
  const id = String(patientId);
  const prev = useLive.getState().patients[id] ?? {};
  const cutoff = Date.now() - WINDOW_MS;
  const series = {};
  for (const [metric, points] of Object.entries(ring)) {
    series[metric] = points.filter((p) => p.ts >= cutoff);
  }
  useLive.setState({
    patients: { ...useLive.getState().patients, [id]: { ...prev, series } },
  });
}
