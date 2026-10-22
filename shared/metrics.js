/**
 * The metric catalogue. One definition drives everything downstream:
 *
 *   - the server rules engine and the client change detector share `target` /
 *     `danger` / `deltaAlert` (see bands.js, detector.js)
 *   - the VitalsWall canvas sizes its numeric fields from `digits` / `decimals`
 *   - the ROI layout — and therefore what MediaPipe crops out of each frame —
 *     is derived from those same two numbers, so a metric can never render
 *     more digits than the reader is looking for
 *
 * Band shape is deliberately the same as homecare's careGuide specs, so the
 * charting components port across without a translation layer.
 */

export const METRICS = {
  hr: {
    key: 'hr',
    label: 'Heart rate',
    short: 'HR',
    unit: 'bpm',
    digits: 3,
    decimals: 0,
    target: { min: 50, max: 100 },
    danger: { min: 40, max: 130 },
    // A 25 bpm swing inside five minutes is worth flagging even if both ends
    // sit inside the target band.
    deltaAlert: { delta: 25, windowSec: 300 },
    plausible: { min: 20, max: 250 },
    flatlineSamples: 90,
  },
  spo2: {
    key: 'spo2',
    label: 'Oxygen saturation',
    short: 'SpO₂',
    unit: '%',
    digits: 3,
    decimals: 0,
    target: { min: 94, max: 100 },
    danger: { min: 88, max: 100 },
    // The clinically important one: a 3-point fall predicts deterioration long
    // before the absolute number leaves the target band.
    deltaAlert: { delta: 3, windowSec: 300, direction: 'down' },
    plausible: { min: 50, max: 100 },
    flatlineSamples: 180,
  },
  rr: {
    key: 'rr',
    label: 'Respiration rate',
    short: 'RR',
    unit: '/min',
    digits: 2,
    decimals: 0,
    target: { min: 12, max: 20 },
    danger: { min: 8, max: 25 },
    deltaAlert: { delta: 8, windowSec: 300 },
    plausible: { min: 3, max: 60 },
    flatlineSamples: 120,
  },
  bp: {
    key: 'bp',
    label: 'Blood pressure',
    short: 'BP',
    unit: 'mmHg',
    dual: true,
    digits: 3,
    digits2: 3,
    decimals: 0,
    target: { min: 100, max: 140, min2: 60, max2: 90 },
    danger: { min: 90, max: 180, min2: 50, max2: 110 },
    deltaAlert: { delta: 30, windowSec: 600 },
    plausible: { min: 50, max: 260 },
    flatlineSamples: 240,
  },
  temp: {
    key: 'temp',
    label: 'Temperature',
    short: 'Temp',
    unit: '°C',
    digits: 3, // "37.4" — three digits; the point is drawn, not classified
    decimals: 1,
    target: { min: 36.1, max: 37.8 },
    danger: { min: 35, max: 39.5 },
    deltaAlert: { delta: 1.5, windowSec: 900 },
    plausible: { min: 30, max: 43 },
    flatlineSamples: 900,
  },
  glucose: {
    key: 'glucose',
    label: 'Blood glucose',
    short: 'Glu',
    unit: 'mmol/L',
    digits: 3,
    decimals: 1,
    target: { min: 4, max: 10 },
    danger: { min: 3, max: 20 },
    deltaAlert: { delta: 5, windowSec: 900 },
    plausible: { min: 1, max: 35 },
    flatlineSamples: 900,
  },
};

/** Display order — shared by the ward tiles, the monitor page and the canvas. */
export const METRIC_ORDER = ['hr', 'spo2', 'rr', 'bp', 'temp', 'glucose'];

export const metricList = () => METRIC_ORDER.map((k) => METRICS[k]);

/**
 * Per-patient threshold overrides ride on top of the catalogue rather than
 * replacing it, so a patient with COPD can sit at 88–92% SpO₂ without any
 * other band, unit, or render setting drifting from the default.
 */
export function resolveSpec(key, overrides) {
  const base = METRICS[key];
  if (!base) return null;
  const o = overrides?.[key];
  if (!o) return base;
  return {
    ...base,
    target: { ...base.target, ...o.target },
    danger: { ...base.danger, ...o.danger },
    deltaAlert: o.deltaAlert ? { ...base.deltaAlert, ...o.deltaAlert } : base.deltaAlert,
  };
}

export function resolveSpecs(overrides) {
  return Object.fromEntries(METRIC_ORDER.map((k) => [k, resolveSpec(k, overrides)]));
}

/** How a value is rendered on the wall — and therefore what MediaPipe must read back. */
export function formatValue(spec, value) {
  if (value == null || Number.isNaN(value)) return null;
  return value.toFixed(spec.decimals);
}
