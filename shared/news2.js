/**
 * NEWS2 — the Royal College of Physicians' National Early Warning Score.
 *
 * Six parameters are scored 0–3 each and summed. It is the reason this system
 * catches deterioration that no single threshold would: a patient can sit
 * inside every individual band and still score 5 by drifting on all of them at
 * once, which is exactly what early sepsis looks like.
 *
 * Reference: RCP, National Early Warning Score (NEWS) 2, 2017.
 */

const band = (value, rules, fallback = 0) => {
  if (value == null || Number.isNaN(value)) return null;
  for (const [max, score] of rules) if (value <= max) return score;
  return fallback;
};

/** Respiration rate: ≤8→3, 9–11→1, 12–20→0, 21–24→2, ≥25→3 */
export const scoreRr = (v) => band(v, [[8, 3], [11, 1], [20, 0], [24, 2]], 3);

/** SpO₂ (Scale 1): ≤91→3, 92–93→2, 94–95→1, ≥96→0 */
export const scoreSpo2 = (v) => band(v, [[91, 3], [93, 2], [95, 1]], 0);

/** Systolic BP: ≤90→3, 91–100→2, 101–110→1, 111–219→0, ≥220→3 */
export const scoreSbp = (v) => band(v, [[90, 3], [100, 2], [110, 1], [219, 0]], 3);

/** Pulse: ≤40→3, 41–50→1, 51–90→0, 91–110→1, 111–130→2, ≥131→3 */
export const scoreHr = (v) => band(v, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2]], 3);

/** Temperature: ≤35.0→3, 35.1–36.0→1, 36.1–38.0→0, 38.1–39.0→1, ≥39.1→2 */
export const scoreTemp = (v) => band(v, [[35, 3], [36, 1], [38, 0], [39, 1]], 2);

/** Supplemental oxygen: on air 0, on oxygen 2. */
export const scoreOxygen = (onOxygen) => (onOxygen ? 2 : 0);

/** Consciousness: alert 0, anything on the CVPU scale 3. */
export const scoreConsciousness = (level) => (level && level !== 'alert' ? 3 : 0);

/**
 * @param {object} v latest values — { rr, spo2, bp:{systolic}, hr, temp }
 * @param {object} ctx { onOxygen, consciousness }
 */
export function news2(v = {}, ctx = {}) {
  const parts = {
    rr: scoreRr(v.rr),
    spo2: scoreSpo2(v.spo2),
    oxygen: scoreOxygen(ctx.onOxygen),
    sbp: scoreSbp(v.bp?.systolic ?? v.sbp),
    hr: scoreHr(v.hr),
    consciousness: scoreConsciousness(ctx.consciousness),
    temp: scoreTemp(v.temp),
  };

  const scored = Object.entries(parts).filter(([, s]) => s != null);
  const total = scored.reduce((sum, [, s]) => sum + s, 0);
  const maxSingle = scored.reduce((m, [, s]) => Math.max(m, s), 0);

  return {
    parts,
    total,
    maxSingle,
    // A parameter is missing when its device is offline — the score is still
    // useful, but the UI must say it is partial rather than reassuringly low.
    complete: scored.length === Object.keys(parts).length,
    risk: riskLevel(total, maxSingle),
  };
}

/**
 * RCP escalation bands. The `maxSingle === 3` case matters: one parameter
 * scoring 3 warrants urgent review even when the total is only 3.
 */
export function riskLevel(total, maxSingle) {
  if (total >= 7) return 'high';
  if (total >= 5) return 'medium';
  if (maxSingle >= 3) return 'low-medium';
  if (total >= 1) return 'low';
  return 'none';
}

export const RISK_SEVERITY = {
  high: 'critical',
  medium: 'critical',
  'low-medium': 'warning',
  low: 'info',
  none: 'ok',
};

export const RISK_LABEL = {
  high: 'Emergency response',
  medium: 'Urgent review',
  'low-medium': 'Urgent ward review',
  low: 'Routine monitoring',
  none: 'Stable',
};

/** How often NEWS2 says this patient should be observed. Drives the ward board. */
export const RISK_CADENCE = {
  high: 'Continuous',
  medium: 'Hourly',
  'low-medium': 'Hourly',
  low: 'Every 4–6h',
  none: 'Every 12h',
};
