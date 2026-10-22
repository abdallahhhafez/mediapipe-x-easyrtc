import { METRIC_ORDER, resolveSpecs } from '@vitalwatch/shared/metrics.js';
import { byId, progress } from './scenarios.js';
import { createTicker } from './ticker.js';

/**
 * Stand-in for the USB devices, satisfying the DeviceDriver contract in
 * driver.js. It exists so the whole system — sockets, rules engine, vitals
 * stream, MediaPipe — can be exercised end to end before any hardware arrives.
 *
 * Two properties matter for the result to be worth anything:
 *
 *   1. Values are anchored to *this patient's* bands, not a generic healthy
 *      adult's. A COPD patient whose target is 88–94% must idle at 91%, or the
 *      demo would show a ward permanently in alarm for no clinical reason.
 *   2. Movement is an Ornstein–Uhlenbeck walk — noisy sample to sample but
 *      pulled back toward baseline — rather than a pure random walk, which
 *      wanders out of band on its own within a few minutes and would make the
 *      false-alarm behaviour impossible to judge.
 */

/** A healthy adult at rest, before the patient's own bands are applied. */
const HEALTHY = { hr: 72, spo2: 97, rr: 15, temp: 36.8, glucose: 5.4, bp: [118, 76] };

/** Per-sample noise, roughly matching what each real device reports. */
const NOISE = { hr: 1.6, spo2: 0.9, rr: 0.8, temp: 0.08, glucose: 0.15, bp: [3, 2] };

/** How strongly a value is pulled back to baseline each second. */
const PULL = 0.06;

export function createSimulator({ thresholds, onFrame, hz = 1 } = {}) {
  const specs = resolveSpecs(thresholds);
  const baseline = baselineFor(specs);

  const current = {};
  for (const key of METRIC_ORDER) {
    current[key] = specs[key].dual ? [...baseline[key]] : baseline[key];
  }

  let timer = null;
  let scenario = null;
  let scenarioStart = 0;
  let frozen = null;
  let emit = onFrame;

  function step() {
    const now = Date.now();
    const elapsed = scenario ? (now - scenarioStart) / 1000 : 0;
    const p = progress(scenario, elapsed);
    const offsets = scenario?.offsets?.(p) ?? {};
    const samples = [];

    for (const key of METRIC_ORDER) {
      const spec = specs[key];
      const affected = scenario?.metrics?.includes(key);

      // A silenced device emits nothing at all — that is the point of it.
      if (affected && scenario.mode === 'silent') continue;

      if (affected && scenario.mode === 'implausible') {
        samples.push({ metric: key, value: 0, value2: spec.dual ? 0 : undefined, ts: now });
        continue;
      }

      if (affected && scenario.mode === 'freeze') {
        frozen ??= {};
        frozen[key] ??= round(current[key], spec.decimals);
        samples.push({ metric: key, value: frozen[key], ts: now });
        continue;
      }

      const offset = offsets[key];
      if (spec.dual) {
        const target = [baseline[key][0] + (offset?.[0] ?? 0), baseline[key][1] + (offset?.[1] ?? 0)];
        current[key] = [
          walk(current[key][0], target[0], NOISE[key][0]),
          walk(current[key][1], target[1], NOISE[key][1]),
        ];
        samples.push({
          metric: key,
          value: round(current[key][0], spec.decimals),
          value2: round(current[key][1], spec.decimals),
          ts: now,
        });
      } else {
        const target = baseline[key] + (offset ?? 0);
        current[key] = walk(current[key], target, NOISE[key]);
        samples.push({ metric: key, value: round(current[key], spec.decimals), ts: now });
      }
    }

    if (samples.length) emit?.(samples);
  }

  return {
    id: 'simulator',
    label: 'Simulated devices',
    metrics: METRIC_ORDER,

    start(handler) {
      if (handler) emit = handler;
      if (timer) return;
      step(); // emit immediately rather than after a full second
      // A worker-backed clock: a kiosk left in a background tab must not stop
      // reporting. See devices/ticker.js.
      timer = createTicker(1000 / hz, step);
      timer.start();
    },

    stop() {
      timer?.stop();
      timer = null;
    },

    trigger(id) {
      scenario = byId(id);
      scenarioStart = Date.now();
      frozen = null;
      return scenario;
    },

    clear() {
      scenario = null;
      frozen = null;
    },

    get scenario() {
      return scenario;
    },
    get elapsed() {
      return scenario ? (Date.now() - scenarioStart) / 1000 : 0;
    },
    baseline,
    specs,
  };
}

/**
 * Anchor a healthy adult's values inside this patient's own bands.
 *
 * Clamped to the inner 10% of the target range so ordinary noise never pushes
 * a stable patient across a threshold — the reason the false-alarm rate stays
 * at zero on the stable-patient fixture.
 */
function baselineFor(specs) {
  const out = {};
  for (const key of METRIC_ORDER) {
    const spec = specs[key];
    if (spec.dual) {
      out[key] = [
        clampInto(HEALTHY[key][0], spec.target.min, spec.target.max),
        clampInto(HEALTHY[key][1], spec.target.min2, spec.target.max2),
      ];
    } else {
      out[key] = clampInto(HEALTHY[key], spec.target.min, spec.target.max);
    }
  }
  return out;
}

function clampInto(value, min, max) {
  if (min == null || max == null) return value;
  const inset = (max - min) * 0.1;
  return Math.min(Math.max(value, min + inset), max - inset);
}

const walk = (value, target, noise) =>
  value + (target - value) * PULL + (Math.random() - 0.5) * 2 * noise;

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;
