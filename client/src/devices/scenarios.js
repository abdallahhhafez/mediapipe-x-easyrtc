/**
 * Injectable clinical events, for demonstrating and testing the alert path.
 *
 * Each returns *offsets* from the patient's own baseline rather than absolute
 * values, so a scenario behaves correctly on a COPD patient sitting at 91%
 * exactly as it does on one sitting at 97%.
 *
 * `mode` marks the scenarios that are device faults rather than clinical
 * events — the ones that must produce a "check the probe" alert and never a
 * "this patient is dying" alert.
 */

export const SCENARIOS = [
  {
    id: 'desaturation',
    label: 'Desaturation',
    blurb: 'SpO₂ falls 13 points over 4 minutes with compensatory tachycardia.',
    tone: 'danger',
    durationSec: 300,
    offsets: (p) => ({ spo2: -13 * p, hr: +38 * p }),
  },
  {
    id: 'tachycardia',
    label: 'Tachycardia',
    blurb: 'Heart rate climbs past 130 bpm in about a minute.',
    tone: 'danger',
    durationSec: 90,
    offsets: (p) => ({ hr: +65 * p }),
  },
  {
    id: 'sepsis',
    label: 'Sepsis onset',
    blurb:
      'Every parameter drifts together — the case only the aggregate NEWS2 score catches early.',
    tone: 'danger',
    durationSec: 480,
    offsets: (p) => ({
      temp: +2.4 * p,
      hr: +45 * p,
      rr: +9 * p,
      spo2: -4 * p,
      bp: [-32 * p, -20 * p],
    }),
  },
  {
    id: 'hypotension',
    label: 'Hypotension',
    blurb: 'Blood pressure drops 40/25 over three minutes.',
    tone: 'danger',
    durationSec: 180,
    offsets: (p) => ({ bp: [-42 * p, -26 * p], hr: +18 * p }),
  },
  {
    id: 'hyperglycaemia',
    label: 'Hyperglycaemia',
    blurb: 'Glucose climbs above 20 mmol/L over five minutes.',
    tone: 'warn',
    durationSec: 300,
    offsets: (p) => ({ glucose: +16 * p }),
  },
  {
    id: 'probe_off',
    label: 'Probe falls off',
    blurb: 'The oximeter reports zeroes. Must read as a sensor fault, not an arrest.',
    tone: 'warn',
    mode: 'implausible',
    metrics: ['spo2', 'hr'],
  },
  {
    id: 'flatline',
    label: 'Sensor freezes',
    blurb: 'The oximeter repeats one value forever. Must be reported as frozen.',
    tone: 'warn',
    mode: 'freeze',
    metrics: ['spo2'],
  },
  {
    id: 'disconnect',
    label: 'Device unplugged',
    blurb: 'Readings stop entirely. The server notices the silence and alerts.',
    tone: 'warn',
    mode: 'silent',
    metrics: ['spo2', 'hr'],
  },
];

export const byId = (id) => SCENARIOS.find((s) => s.id === id) ?? null;

/** Progress 0→1 across the scenario, then held at 1 until it is cleared. */
export function progress(scenario, elapsedSec) {
  if (!scenario?.durationSec) return 1;
  return Math.min(1, elapsedSec / scenario.durationSec);
}
