import { describe, it, expect } from 'vitest';
import { createDetector } from '../detector.js';
import { news2 } from '../news2.js';
import { severityFor } from '../bands.js';
import { METRICS } from '../metrics.js';
import {
  T0,
  noisyStable,
  desaturation,
  sepsisOnset,
  probeOff,
  frozenSensor,
} from '../fixtures/traces.js';

/** Replay a trace and collect everything the detector emitted. */
function replay(samples, options) {
  const d = createDetector(options);
  const events = [];
  for (const s of samples) {
    for (const e of d.push(s)) events.push({ ...e, at: (s.ts - T0) / 1000 });
  }
  return { detector: d, events, raised: events.filter((e) => e.action === 'raise') };
}

const kinds = (events) => [...new Set(events.map((e) => e.alert.kind))];
const firstOf = (events, kind, metric) =>
  events.find((e) => e.alert.kind === kind && (!metric || e.alert.metric === metric));

describe('band checks', () => {
  it('grades against target then danger', () => {
    expect(severityFor(METRICS.spo2, 97)).toBe(null);
    expect(severityFor(METRICS.spo2, 92)).toBe('warning');
    expect(severityFor(METRICS.spo2, 85)).toBe('critical');
  });

  it('treats either half of a dual reading as out of band', () => {
    expect(severityFor(METRICS.bp, 120, 75)).toBe(null);
    expect(severityFor(METRICS.bp, 120, 95)).toBe('warning'); // diastolic only
    expect(severityFor(METRICS.bp, 85, 75)).toBe('critical'); // systolic only
  });
});

describe('NEWS2', () => {
  it('scores the RCP worked example', () => {
    // RR 21 (+2), SpO2 93 (+2), on air (0), SBP 105 (+1), HR 112 (+2),
    // alert (0), temp 38.4 (+1) => 8, high risk.
    const s = news2(
      { rr: 21, spo2: 93, sbp: 105, hr: 112, temp: 38.4 },
      { onOxygen: false, consciousness: 'alert' },
    );
    expect(s.total).toBe(8);
    expect(s.risk).toBe('high');
  });

  it('escalates on a single parameter scoring 3 even when the total is low', () => {
    const s = news2({ rr: 15, spo2: 97, sbp: 120, hr: 38, temp: 36.8 });
    expect(s.total).toBe(3);
    expect(s.maxSingle).toBe(3);
    expect(s.risk).toBe('low-medium');
  });

  it('reports partial when a device is offline', () => {
    expect(news2({ hr: 70 }).complete).toBe(false);
    expect(news2({ rr: 15, spo2: 97, sbp: 120, hr: 70, temp: 36.8 }).complete).toBe(true);
  });
});

describe('detector — the false-alarm guard', () => {
  it('raises nothing at all on a stable patient with noisy sensors', () => {
    const { raised } = replay(noisyStable());
    expect(raised.map((e) => `${e.alert.kind}:${e.alert.metric}`)).toEqual([]);
  });

  it('ignores a single bad sample', () => {
    const d = createDetector();
    let events = [];
    for (let t = 0; t < 20; t++) {
      const spo2 = t === 10 ? 70 : 97; // one dropout
      events.push(...d.push({ metric: 'spo2', value: spo2, ts: T0 + t * 1000 }));
    }
    expect(events.filter((e) => e.action === 'raise')).toEqual([]);
  });
});

describe('detector — desaturation', () => {
  const { events, raised } = replay(desaturation());

  it('catches the fall while SpO2 is still inside the target band', () => {
    const rapid = firstOf(raised, 'rapid_change', 'spo2');
    expect(rapid).toBeTruthy();
    // Onset is t=300; the 3-point drop is reached well before the band at 94.
    expect(rapid.at).toBeGreaterThan(300);
    expect(rapid.at).toBeLessThan(400);
  });

  it('then raises the band alert, and escalates it to critical', () => {
    const oor = firstOf(raised, 'out_of_range', 'spo2');
    expect(oor.alert.severity).toBe('warning');
    const escalated = events.find(
      (e) => e.action === 'escalate' && e.alert.metric === 'spo2',
    );
    expect(escalated.alert.severity).toBe('critical');
    expect(escalated.at).toBeGreaterThan(oor.at);
  });

  it('flags the compensatory tachycardia too', () => {
    expect(firstOf(raised, 'rapid_change', 'hr')).toBeTruthy();
  });

  it('does not fire before the event', () => {
    expect(raised.every((e) => e.at >= 300)).toBe(true);
  });
});

describe('detector — sepsis onset', () => {
  const { events, raised, detector } = replay(sepsisOnset());

  it('raises the aggregate score', () => {
    const n = firstOf(raised, 'news2');
    expect(n).toBeTruthy();
    expect(detector.score().total).toBeGreaterThanOrEqual(5);
  });

  /**
   * The whole reason NEWS2 is in here. Every parameter drifts together, so the
   * aggregate reaches critical while each individual metric is still only
   * mildly out of target — no single threshold would escalate this patient
   * for another three minutes.
   */
  it('reaches critical while every individual metric is still only a warning', () => {
    const n = firstOf(raised, 'news2');
    expect(n.alert.severity).toBe('critical');

    const individualCriticals = raised.filter(
      (e) => e.alert.metric && e.alert.severity === 'critical',
    );
    expect(individualCriticals.every((e) => e.at > n.at)).toBe(true);
  });

  it('names the parameters driving the score', () => {
    expect(firstOf(raised, 'news2').alert.body).toMatch(/Driven by/);
  });
});

describe('detector — device faults never read as clinical events', () => {
  it('probe-off raises an implausible-reading alert and no band alert', () => {
    const { raised } = replay(probeOff());
    expect(kinds(raised)).toContain('implausible');
    const clinical = raised.filter(
      (e) => e.alert.metric === 'spo2' && e.alert.kind === 'out_of_range',
    );
    expect(clinical).toEqual([]);
  });

  it('a frozen sensor is reported as frozen, not as a stable patient', () => {
    const { raised } = replay(frozenSensor());
    const flat = firstOf(raised, 'flatline', 'spo2');
    expect(flat).toBeTruthy();
    expect(flat.alert.severity).toBe('warning');
  });

  it('a silent device is reported on tick, and clears when it comes back', () => {
    const d = createDetector();
    d.push({ metric: 'hr', value: 72, ts: T0 });
    expect(d.tick(T0 + 5_000)).toEqual([]);

    const lost = d.tick(T0 + 30_000);
    expect(lost[0].alert.kind).toBe('signal_lost');

    const back = d.push({ metric: 'hr', value: 74, ts: T0 + 40_000 });
    expect(back.some((e) => e.action === 'clear' && e.alert.kind === 'signal_lost')).toBe(true);
  });
});

describe('detector — hysteresis', () => {
  it('holds an alert open until the reading is convincingly back in range', () => {
    const d = createDetector();
    const feed = (value, from, count) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push(...d.push({ metric: 'spo2', value, ts: T0 + (from + i) * 1000 }));
      }
      return out;
    };

    expect(feed(90, 0, 8).some((e) => e.action === 'raise')).toBe(true);
    // One good sample must not close it.
    expect(feed(97, 8, 1).some((e) => e.action === 'clear')).toBe(false);
    expect(feed(97, 9, 5).some((e) => e.action === 'clear')).toBe(true);
  });

  it('does not re-raise an alert that is already open', () => {
    const d = createDetector();
    let raises = 0;
    for (let t = 0; t < 60; t++) {
      for (const e of d.push({ metric: 'spo2', value: 90, ts: T0 + t * 1000 })) {
        if (e.action === 'raise' && e.alert.kind === 'out_of_range') raises++;
      }
    }
    expect(raises).toBe(1);
  });
});

describe('detector — per-patient overrides', () => {
  it('lets a COPD patient sit at 89% without alerting', () => {
    const d = createDetector({ overrides: { spo2: { target: { min: 88 }, danger: { min: 84 } } } });
    let events = [];
    for (let t = 0; t < 30; t++) {
      events.push(...d.push({ metric: 'spo2', value: 89, ts: T0 + t * 1000 }));
    }
    expect(events.filter((e) => e.action === 'raise')).toEqual([]);
    expect(severityFor(d.specs.spo2, 83)).toBe('critical');
  });
});
