/**
 * Deterministic vitals traces for the detector tests.
 *
 * Generated rather than stored as JSON so a trace reads as a clinical story
 * ("stable for 5 minutes, then desaturates over 4") instead of 3,000 opaque
 * numbers — and so the seeded PRNG gives byte-identical output on every run.
 */

/** mulberry32 — small, fast, and reproducible across platforms. */
export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const T0 = 1_700_000_000_000; // fixed epoch, so timestamps are stable

const BASELINE = { hr: 72, spo2: 97, rr: 15, temp: 36.8, glucose: 5.4, bp: [118, 76] };

/**
 * Build a 1 Hz multi-metric trace.
 * @param {object} o
 * @param {number} o.seconds total duration
 * @param {(t:number, base:object)=>object} [o.at] per-second override hook —
 *        returns partial values to blend over the baseline
 */
export function trace({ seconds, at, seed = 7, noise = 1 }) {
  const rand = rng(seed);
  const jitter = (scale) => (rand() - 0.5) * 2 * scale * noise;
  const samples = [];

  for (let t = 0; t < seconds; t++) {
    const ts = T0 + t * 1000;
    const override = at?.(t, BASELINE) || {};
    const v = { ...BASELINE, ...override };

    const push = (metric, value, value2) =>
      samples.push({ metric, value, value2, ts });

    push('hr', round(v.hr + jitter(1.5), 0));
    // Wide enough that a healthy patient's integer SpO₂ actually moves between
    // 96–98 the way a real oximeter's does. A fixture that sat on one value
    // would be quietly testing a frozen sensor instead of a stable patient.
    push('spo2', round(v.spo2 + jitter(0.9), 0));
    push('rr', round(v.rr + jitter(0.8), 0));
    push('temp', round(v.temp + jitter(0.08), 1));
    push('glucose', round(v.glucose + jitter(0.15), 1));
    push('bp', round(v.bp[0] + jitter(3), 0), round(v.bp[1] + jitter(2), 0));
  }
  return samples;
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

/** A healthy patient with realistic sensor noise. Must produce zero alerts. */
export const noisyStable = () => trace({ seconds: 600, seed: 11, noise: 1.4 });

/**
 * Silent hypoxia: SpO₂ slides from 97% to 84% over four minutes starting at
 * t=300, with the compensatory tachycardia that accompanies it.
 */
export const desaturation = () =>
  trace({
    seconds: 600,
    seed: 3,
    at: (t, base) => {
      if (t < 300) return {};
      const p = Math.min(1, (t - 300) / 240);
      return { spo2: base.spo2 - 13 * p, hr: base.hr + 38 * p };
    },
  });

/**
 * Early sepsis: no single parameter leaves its band for a long time, but
 * temperature, heart rate, respiration and pressure all drift together — the
 * case that only NEWS2 catches.
 */
export const sepsisOnset = () =>
  trace({
    seconds: 900,
    seed: 5,
    at: (t, base) => {
      if (t < 200) return {};
      const p = Math.min(1, (t - 200) / 500);
      return {
        temp: base.temp + 2.4 * p,
        hr: base.hr + 45 * p,
        rr: base.rr + 9 * p,
        bp: [base.bp[0] - 32 * p, base.bp[1] - 20 * p],
        spo2: base.spo2 - 4 * p,
      };
    },
  });

/**
 * The pulse oximeter falls off the finger at t=200: SpO₂ and HR collapse to
 * impossible values. Must produce a device alert and *no* clinical alert.
 */
export const probeOff = () =>
  trace({
    seconds: 400,
    seed: 9,
    at: (t) => (t < 200 ? {} : { spo2: 0, hr: 0 }),
  });

/** A frozen sensor: SpO₂ reports the exact same value forever after t=100. */
export const frozenSensor = () =>
  trace({
    seconds: 400,
    seed: 13,
    noise: 0,
    at: (t, base) => (t < 100 ? {} : { spo2: base.spo2 }),
  });
