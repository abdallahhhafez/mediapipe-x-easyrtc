/**
 * Band checks. Ported from homecare's ReadingChart#pointSeverity so the chart
 * dots, the ward tiles, the server rules engine and the MediaPipe change
 * detector can never disagree about what "abnormal" means.
 */

/** Is `value` outside `band`? Handles the dual (systolic/diastolic) case. */
export function outsideBand(band, value, value2) {
  if (!band) return false;
  if (band.min != null && value < band.min) return true;
  if (band.max != null && value > band.max) return true;
  if (value2 != null) {
    if (band.min2 != null && value2 < band.min2) return true;
    if (band.max2 != null && value2 > band.max2) return true;
  }
  return false;
}

/** `'critical' | 'warning' | null` — null meaning the reading is in target. */
export function severityFor(spec, value, value2) {
  if (value == null) return null;
  if (outsideBand(spec.danger, value, value2)) return 'critical';
  if (outsideBand(spec.target, value, value2)) return 'warning';
  return null;
}

/** Cheap sanity gate: a value this far out is a broken sensor, not a patient. */
export function isPlausible(spec, value, value2) {
  const ok = (v) =>
    v == null || (v >= spec.plausible.min && v <= spec.plausible.max);
  return ok(value) && ok(value2);
}

/** Which side of the band the reading fell out of — needed for readable copy. */
export function bandDirection(band, value, value2) {
  if (band.min != null && value < band.min) return 'low';
  if (band.max != null && value > band.max) return 'high';
  if (value2 != null) {
    if (band.min2 != null && value2 < band.min2) return 'low';
    if (band.max2 != null && value2 > band.max2) return 'high';
  }
  return null;
}

export function describeReading(spec, value, value2) {
  const shown = spec.dual && value2 != null ? `${value}/${value2}` : value;
  return `${spec.short} ${shown} ${spec.unit}`.trim();
}

export function bandText(band, spec) {
  if (!band) return '';
  const range = (lo, hi) =>
    lo != null && hi != null ? `${lo}–${hi}` : lo != null ? `≥${lo}` : `≤${hi}`;
  const main = range(band.min, band.max);
  if (!spec?.dual || band.min2 == null) return main;
  return `${main} / ${range(band.min2, band.max2)}`;
}
