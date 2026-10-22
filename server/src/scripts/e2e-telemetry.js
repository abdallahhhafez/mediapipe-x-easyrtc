/**
 * End-to-end check of the 24/7 path, run against a live server.
 *
 *   node server/src/scripts/e2e-telemetry.js [trace]
 *
 * Logs in as a patient, replays a fixture trace over the telemetry socket at
 * high speed, and asserts that the server's rules engine raised the alerts the
 * detector unit tests expect — proving the socket, the monitor loop and the
 * Alert collection are all wired together, not just the pure logic.
 */
import { io } from 'socket.io-client';
import * as traces from '../../../shared/fixtures/traces.js';

const BASE = process.env.BASE || 'http://localhost:4100';
const TRACE = process.argv[2] || 'desaturation';
// Replay faster than real time, but keep the sample timestamps authentic so the
// detector's windows and debounce behave exactly as they would live.
const CHUNK_SECONDS = 5;
const CHUNK_DELAY_MS = 15;

const login = async (email, password) => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Each trace gets its own patient. The monitor keeps one detector per patient
 * and alerts persist, so replaying two traces onto the same bed would have the
 * second one inherit the first one's open alerts and rolling windows.
 */
const PATIENT_FOR = {
  desaturation: 1,
  sepsisOnset: 2,
  // Deliberately not patient 3 — that bed has COPD band overrides, and the
  // fixtures carry a generic baseline, so it would read as out-of-target for
  // reasons that have nothing to do with the trace under test.
  probeOff: 6,
  noisyStable: 4,
  frozenSensor: 5,
};

const bed = Number(process.argv[3]) || PATIENT_FOR[TRACE] || 1;
const patient = await login(`patient${bed}@vitalwatch.test`, 'vitalwatch');
const nurse = await login('nurse@vitalwatch.test', 'vitalwatch');
const patientId = patient.user.patient;

console.log(`replaying "${TRACE}" for ${patient.user.name}`);

const socket = io(`${BASE}/telemetry`, { auth: { token: patient.token } });
await new Promise((resolve, reject) => {
  socket.on('connect', resolve);
  socket.on('connect_error', reject);
});

const samples = traces[TRACE]();
// Shift the fixture's fixed epoch to now, so staleness and SLA logic see
// timestamps that make sense relative to the running clock.
const offset = Date.now() - samples[samples.length - 1].ts;

const bySecond = new Map();
for (const s of samples) {
  const key = Math.floor((s.ts - samples[0].ts) / 1000);
  if (!bySecond.has(key)) bySecond.set(key, []);
  bySecond.get(key).push({ ...s, ts: s.ts + offset });
}

let batch = [];
for (const [second, group] of bySecond) {
  batch.push(...group);
  if (second % CHUNK_SECONDS === 0) {
    socket.emit('reading:frame', { samples: batch });
    batch = [];
    await sleep(CHUNK_DELAY_MS);
  }
}
if (batch.length) socket.emit('reading:frame', { samples: batch });

await sleep(1500); // let the last writes land
socket.close();

const res = await fetch(`${BASE}/api/alerts?patient=${patientId}&limit=200`, {
  headers: { Authorization: `Bearer ${nurse.token}` },
});
const { alerts } = await res.json();

console.log(`\n${alerts.length} alert(s) persisted:`);
for (const a of alerts.reverse()) {
  console.log(
    `  [${a.severity.padEnd(8)}] ${a.source.padEnd(9)} ${a.dedupeKey.padEnd(22)} ${a.title}`,
  );
}

const EXPECTED = {
  desaturation: ['spo2:out_of_range', 'spo2:rapid_change', 'news2'],
  sepsisOnset: ['news2', 'temp:out_of_range'],
  probeOff: ['spo2:implausible', 'hr:implausible'],
  noisyStable: [],
  frozenSensor: ['spo2:flatline'],
};

const keys = new Set(alerts.map((a) => a.dedupeKey));
const expected = EXPECTED[TRACE] ?? [];
const missing = expected.filter((k) => !keys.has(k));

// noisyStable is the false-alarm guard: any clinical alert at all is a failure.
// `signal_lost` is exempt — the replay ends and the socket closes, so the
// devices genuinely have stopped reporting. That alert firing is the staleness
// detection working, not a false alarm.
const unexpected =
  TRACE === 'noisyStable' ? [...keys].filter((k) => !k.endsWith(':signal_lost')) : [];

if (missing.length || unexpected.length) {
  console.error(`\nFAIL — missing: [${missing}] unexpected: [${unexpected}]`);
  process.exit(1);
}
console.log(`\nPASS — all expected alerts present (${expected.length} checked)`);
process.exit(0);
