import { METRIC_ORDER, resolveSpecs, formatValue } from './metrics.js';
import { severityFor, isPlausible, bandDirection, describeReading, bandText } from './bands.js';
import { news2, RISK_SEVERITY, RISK_LABEL } from './news2.js';

/**
 * The alerting brain, shared verbatim by two callers:
 *
 *   server/src/monitor/rules.js  — fed the numeric telemetry. This is the 24/7
 *                                  path: it runs whether or not a nurse has a
 *                                  browser open, and it owns persistence.
 *   client/src/vision/changeDetector.js — fed the numbers MediaPipe recognised
 *                                  from the pixels of the vitals stream.
 *
 * Both sides therefore agree on what counts as abnormal, and any disagreement
 * in the alert feed is a real disagreement about what the *numbers* were —
 * which is exactly the signal we want when comparing the two detectors.
 *
 * Everything here is pure and deterministic: timestamps are passed in, never
 * read from the clock, so the fixture tests can replay a trace and assert the
 * precise sample an alert fires on.
 */

export const DEFAULTS = {
  // N-of-M persistence. The single biggest false-alarm killer: a lone bad
  // sample — a patient shifting their finger on the probe, or one misread
  // digit — never reaches the nurse.
  debounce: { n: 5, of: 8 },
  // Consecutive in-range samples needed to clear. Higher than it needs to be
  // on purpose: alerts flapping open/closed is worse than one held a bit long.
  clearAfter: 5,
  // No sample for this long and the device is considered to have dropped.
  staleSec: 20,
  // Fallback for a metric that declares no `flatlineSamples` of its own. How
  // long an identical repeat must run before it means "frozen sensor" rather
  // than "steady patient" depends on how coarse the readout is: an integer
  // SpO₂ on a healthy patient really does sit on 97 for a minute at a time,
  // so this has to be generous per metric or it becomes a false-alarm source.
  flatlineCount: 180,
  // EWMA weight on the newest sample for the trend channel. The rate-of-change
  // check runs on the smoothed series, never the raw one — otherwise a single
  // dropout sample reads as a cliff edge.
  smoothing: 0.25,
  // NEWS2 is only meaningful once enough parameters are present.
  news2MinParams: 4,
};

const KIND_TITLES = {
  out_of_range: 'Reading out of range',
  rapid_change: 'Rapid change',
  flatline: 'Sensor may be frozen',
  implausible: 'Implausible reading',
  signal_lost: 'Device signal lost',
  news2: 'Early warning score raised',
};

/** Severity rank, for deciding whether an open alert has got worse. */
const RANK = { info: 1, warning: 2, critical: 3 };
const worse = (a, b) => (RANK[a] || 0) > (RANK[b] || 0);

export function createDetector({ overrides, options } = {}) {
  const opts = { ...DEFAULTS, ...options };
  const specs = resolveSpecs(overrides);

  /** @type {Record<string, any>} per-metric rolling state */
  const metrics = {};
  /** @type {Map<string, any>} dedupe key -> open alert */
  const open = new Map();
  let context = { onOxygen: false, consciousness: 'alert' };

  const stateFor = (key) =>
    (metrics[key] ||= {
      window: [], // [{ ts, value, value2 }] trimmed to the deltaAlert window
      recent: [], // last `of` severities, for the N-of-M vote
      lastTs: null,
      lastValue: null,
      ewma: null,
      flatRun: 0,
      badRun: 0,
      clearRun: 0,
      rapidRun: 0,
    });

  /** Raise, escalate, or do nothing — whichever the open-alert table calls for. */
  function raise(events, { key, kind, metric, severity, ts, title, body, value, value2 }) {
    const existing = open.get(key);
    const alert = { key, kind, metric, severity, ts, title, body, value, value2 };
    if (!existing) {
      open.set(key, alert);
      events.push({ action: 'raise', alert });
      return;
    }
    if (worse(severity, existing.severity)) {
      open.set(key, alert);
      events.push({ action: 'escalate', alert, from: existing.severity });
    }
  }

  function clear(events, key, ts) {
    const existing = open.get(key);
    if (!existing) return;
    open.delete(key);
    events.push({ action: 'clear', alert: { ...existing, clearedAt: ts } });
  }

  /**
   * Feed one reading. Returns the alert events it caused — usually none.
   * @param {{metric:string, value:number, value2?:number, ts:number}} sample
   */
  function push(sample) {
    const events = [];
    const spec = specs[sample.metric];
    if (!spec) return events;

    const st = stateFor(sample.metric);
    const { value, value2, ts } = sample;
    const wasStale = st.lastTs != null && ts - st.lastTs > opts.staleSec * 1000;

    st.lastTs = ts;

    // A device that had dropped and is now reporting again clears its own alert.
    if (wasStale) clear(events, `${sample.metric}:signal_lost`, ts);

    // ---- 1. plausibility gate -------------------------------------------
    // Runs before anything else: a garbage number must never reach the bands,
    // or a probe falling off reads as a cardiac arrest.
    if (!isPlausible(spec, value, value2)) {
      st.badRun += 1;
      st.clearRun = 0;
      if (st.badRun >= opts.debounce.n) {
        raise(events, {
          key: `${sample.metric}:implausible`,
          kind: 'implausible',
          metric: sample.metric,
          severity: 'warning',
          ts,
          value,
          value2,
          title: `${spec.label} sensor fault`,
          body: `Reading of ${value}${spec.unit} is outside the physically possible range (${spec.plausible.min}–${spec.plausible.max}). Check the probe.`,
        });
      }
      return events;
    }
    st.badRun = 0;
    clear(events, `${sample.metric}:implausible`, ts);

    // ---- 2. flatline ------------------------------------------------------
    if (st.lastValue != null && value === st.lastValue) st.flatRun += 1;
    else st.flatRun = 0;
    st.lastValue = value;

    if (st.flatRun >= (spec.flatlineSamples ?? opts.flatlineCount)) {
      raise(events, {
        key: `${sample.metric}:flatline`,
        kind: 'flatline',
        metric: sample.metric,
        severity: 'warning',
        ts,
        value,
        value2,
        title: `${spec.label} has not changed`,
        body: `Identical reading of ${formatValue(spec, value)}${spec.unit} for ${st.flatRun} samples — the sensor may be frozen.`,
      });
    } else if (st.flatRun === 0) {
      clear(events, `${sample.metric}:flatline`, ts);
    }

    // ---- 3. band crossing, N-of-M debounced ------------------------------
    const severity = severityFor(spec, value, value2);
    st.recent.push(severity);
    if (st.recent.length > opts.debounce.of) st.recent.shift();

    // Clearing is counted on every in-range sample, independent of the vote
    // above, so `clearAfter` means exactly what it says: N consecutive good
    // readings and the alert closes.
    if (severity) st.clearRun = 0;
    else st.clearRun += 1;

    const abnormal = st.recent.filter(Boolean);
    if (abnormal.length >= opts.debounce.n) {
      // Report the worst severity seen across the voting window, not just the
      // latest sample — a reading that dipped critical then recovered to merely
      // warning still deserves the critical alert.
      const level = abnormal.includes('critical') ? 'critical' : 'warning';
      const band = level === 'critical' ? spec.danger : spec.target;
      const dir = bandDirection(band, value, value2) || 'out of';
      raise(events, {
        key: `${sample.metric}:out_of_range`,
        kind: 'out_of_range',
        metric: sample.metric,
        severity: level,
        ts,
        value,
        value2,
        title: `${spec.label} ${dir}`,
        body: `${describeReading(spec, value, value2)} — ${level === 'critical' ? 'outside the safe range' : 'outside target'} of ${bandText(band, spec)} ${spec.unit}.`,
      });
    }
    if (st.clearRun >= opts.clearAfter) clear(events, `${sample.metric}:out_of_range`, ts);

    // ---- 4. rate of change ------------------------------------------------
    // The reading that catches deterioration while every number is still
    // nominally "normal".
    const da = spec.deltaAlert;
    if (da) {
      // Smooth first. The trend channel asks "where is this patient heading",
      // which is a question about the signal, not about any one sample.
      st.ewma =
        st.ewma == null ? value : opts.smoothing * value + (1 - opts.smoothing) * st.ewma;
      st.window.push({ ts, value: st.ewma, raw: value, value2 });
      const cutoff = ts - da.windowSec * 1000;
      while (st.window.length && st.window[0].ts < cutoff) st.window.shift();

      if (st.window.length >= 3) {
        const oldest = st.window[0];
        const delta = st.ewma - oldest.value;
        const magnitude = Math.abs(delta);
        const directionOk =
          !da.direction ||
          (da.direction === 'down' && delta < 0) ||
          (da.direction === 'up' && delta > 0);

        if (magnitude >= da.delta && directionOk) {
          // And require the trend to persist. Smoothing alone still lets a
          // brief artefact drag the average far enough to trip the threshold
          // for a sample or two; a real deterioration holds.
          st.rapidRun += 1;
          if (st.rapidRun >= opts.debounce.n) {
            const mins = Math.max(1, Math.round((ts - oldest.ts) / 60000));
            raise(events, {
              key: `${sample.metric}:rapid_change`,
              kind: 'rapid_change',
              metric: sample.metric,
              // Falling fast *and* already out of band is the deteriorating
              // patient; falling fast from a normal baseline is the early warning.
              severity: severity === 'critical' ? 'critical' : 'warning',
              ts,
              value,
              value2,
              title: `${spec.label} ${delta < 0 ? 'falling' : 'rising'} fast`,
              body: `${formatValue(spec, oldest.value)} → ${formatValue(spec, st.ewma)} ${spec.unit} in ${mins} min (${delta > 0 ? '+' : ''}${formatValue(spec, delta)}).`,
            });
          }
        } else {
          st.rapidRun = 0;
          if (magnitude < da.delta / 2) clear(events, `${sample.metric}:rapid_change`, ts);
        }
      }
    }

    // ---- 5. aggregate early warning score --------------------------------
    events.push(...evaluateNews2(ts));

    return events;
  }

  function latestValues() {
    const out = {};
    for (const key of METRIC_ORDER) {
      const st = metrics[key];
      if (!st || st.lastTs == null) continue;
      const last = st.window[st.window.length - 1];
      // `raw`, not `value` — the window stores the smoothed series that the
      // trend check runs on, and reporting that as "the latest reading" would
      // show a nurse a number no device ever produced, at full float
      // precision, instead of what the patient's monitor actually said.
      out[key] = last ? { value: last.raw, value2: last.value2, ts: last.ts } : null;
    }
    return out;
  }

  function evaluateNews2(ts) {
    const events = [];
    const latest = latestValues();
    const present = Object.values(latest).filter(Boolean).length;
    if (present < opts.news2MinParams) return events;

    const score = news2(
      {
        hr: latest.hr?.value,
        spo2: latest.spo2?.value,
        rr: latest.rr?.value,
        temp: latest.temp?.value,
        sbp: latest.bp?.value,
      },
      context,
    );

    const severity = RISK_SEVERITY[score.risk];
    if (severity === 'critical' || score.risk === 'low-medium') {
      raise(events, {
        key: 'news2',
        kind: 'news2',
        metric: null,
        severity,
        ts,
        value: score.total,
        title: `NEWS2 ${score.total} — ${RISK_LABEL[score.risk].toLowerCase()}`,
        body: `Aggregate early warning score of ${score.total}${score.complete ? '' : ' (partial — some devices offline)'}. ${describeParts(score.parts)}`,
      });
    } else if (score.total <= 2) {
      clear(events, 'news2', ts);
    }
    return events;
  }

  /**
   * Staleness can only be detected by the passage of time, never by an
   * arriving sample — so the caller ticks this on a timer.
   */
  function tick(now) {
    const events = [];
    for (const key of METRIC_ORDER) {
      const st = metrics[key];
      if (!st || st.lastTs == null) continue;
      const idle = now - st.lastTs;
      if (idle > opts.staleSec * 1000) {
        raise(events, {
          key: `${key}:signal_lost`,
          kind: 'signal_lost',
          metric: key,
          severity: 'warning',
          ts: now,
          title: `${specs[key].label} device offline`,
          body: `No reading for ${Math.round(idle / 1000)}s. The device may be unplugged or out of battery.`,
        });
      }
    }
    return events;
  }

  return {
    push,
    tick,
    setContext: (next) => {
      context = { ...context, ...next };
    },
    specs,
    openAlerts: () => [...open.values()],
    latest: latestValues,
    score: () => {
      const latest = latestValues();
      return news2(
        {
          hr: latest.hr?.value,
          spo2: latest.spo2?.value,
          rr: latest.rr?.value,
          temp: latest.temp?.value,
          sbp: latest.bp?.value,
        },
        context,
      );
    },
  };
}

function describeParts(parts) {
  const contributing = Object.entries(parts)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, s]) => `${k} +${s}`);
  return contributing.length ? `Driven by ${contributing.join(', ')}.` : '';
}
