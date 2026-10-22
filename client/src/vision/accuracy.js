import { METRICS } from '@vitalwatch/shared/metrics.js';

/**
 * Scores what the vision pipeline read against what was actually on the screen.
 *
 * The nurse app holds both halves: the telemetry the patient's devices are
 * showing, and the values MediaPipe recovered from the pixels of the video of
 * those screens. Comparing them continuously turns an otherwise unfalsifiable
 * claim ("the CV works") into a number, and it is the only way to catch the
 * reader silently degrading — a layout change, a rescaled track, a dropped
 * model — before it costs an alert.
 *
 * Comparing against a *single* instant does not work once the feed is remote.
 * A frame is rendered at the patient's house, encoded, sent, and decoded, so by
 * the time it is read it shows a value from a few hundred milliseconds ago.
 * Scoring it against the telemetry as of *now* charges the reader for the
 * transport delay and reports a perfect reader at ~95%.
 *
 * So a read counts as correct if it matches what the screen showed at any point
 * in the recent past, and how far back the match was found is reported
 * separately as the feed delay. Those are two genuinely different questions —
 * "is the reader right" and "how stale is the picture" — and a nurse needs both.
 */

const HISTORY = 300;

/** How far back a read may match. Beyond this the feed is stale, not delayed. */
const MATCH_WINDOW_MS = 3000;

export function createAccuracyMonitor() {
  let checks = 0;
  let agreements = 0;
  const recent = [];
  const mismatches = [];
  const perMetric = {};
  /** [{ ts, truth }] — what the screen showed, recently. */
  const history = [];
  const delays = [];

  return {
    /**
     * @param {object} truth metric -> { value, value2 } from telemetry
     * @param {object} read  metric -> { value, value2 } from the pixels
     * @param {number} [ts]
     */
    compare(truth, read, ts = Date.now()) {
      if (truth && Object.keys(truth).length) {
        history.push({ ts, truth });
        while (history.length && ts - history[0].ts > MATCH_WINDOW_MS) history.shift();
      }
      if (!history.length) return;

      const newest = history[history.length - 1].truth;

      for (const [metric, actual] of Object.entries(newest)) {
        if (!actual) continue;
        const spec = METRICS[metric];
        const seen = read[metric];

        // A field the reader declined to guess is not a mismatch — the
        // confidence gate doing its job is a correct outcome, counted
        // separately so a reader that abstains constantly still looks bad.
        if (!seen || seen.value == null) {
          bump(perMetric, metric, 'abstained');
          continue;
        }

        // Newest first: the smallest delay that explains the reading is the
        // most likely one.
        let matched = null;
        for (let i = history.length - 1; i >= 0; i--) {
          const candidate = history[i].truth[metric];
          if (candidate && matches(spec, seen, candidate)) {
            matched = history[i];
            break;
          }
        }

        checks++;
        if (matched) {
          agreements++;
          bump(perMetric, metric, 'correct');
          delays.push(ts - matched.ts);
          if (delays.length > HISTORY) delays.shift();
        } else {
          bump(perMetric, metric, 'wrong');
          mismatches.unshift({
            metric,
            expected: actual,
            got: seen,
            text: `${spec.short}: screen showed ${describe(spec, actual)}, read ${describe(spec, seen)}`,
            ts,
          });
          mismatches.length = Math.min(mismatches.length, 20);
        }

        recent.push(Boolean(matched));
        if (recent.length > HISTORY) recent.shift();
      }
    },

    stats() {
      const windowed = recent.length ? recent.filter(Boolean).length / recent.length : null;
      return {
        checks,
        agreements,
        overall: checks ? agreements / checks : null,
        // The rolling figure is the useful one — a lifetime average hides a
        // reader that broke five minutes ago.
        windowed,
        samples: recent.length,
        feedDelayMs: median(delays),
        mismatches,
        perMetric,
      };
    },

    reset() {
      checks = 0;
      agreements = 0;
      recent.length = 0;
      mismatches.length = 0;
      history.length = 0;
      delays.length = 0;
      for (const key of Object.keys(perMetric)) delete perMetric[key];
    },
  };
}

/** Both channels must agree — a BP whose systolic matches but whose diastolic
 *  does not is a misread, and reporting only the systolic made mismatches read
 *  as the nonsense "showed 121, read 121". */
function matches(spec, read, actual) {
  return near(read.value, actual.value, spec) && (!spec.dual || near(read.value2, actual.value2, spec));
}

/**
 * Compared at the precision the screen renders, not at full float precision —
 * a display showing "36.8" cannot be read back as 36.83, and holding the reader
 * to a resolution the pixels never carried would measure the wrong thing.
 */
function near(read, actual, spec) {
  if (read == null || actual == null) return read == null && actual == null;
  const q = 10 ** spec.decimals;
  return Math.round(read * q) === Math.round(actual * q);
}

const describe = (spec, r) =>
  spec.dual && r.value2 != null ? `${r.value}/${r.value2}` : String(r.value);

function bump(store, metric, key) {
  const entry = (store[metric] ??= { correct: 0, wrong: 0, abstained: 0 });
  entry[key]++;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
