import { createDetector } from '@vitalwatch/shared/detector.js';

/**
 * The alerting half of the vision pipeline.
 *
 * Fed only with numbers MediaPipe recovered from the pixels — never with the
 * telemetry — so an alert raised here is genuinely an alert raised from
 * watching the screen. It runs the same shared detector the server does, which
 * is what makes the two feeds comparable: any disagreement is a disagreement
 * about what the numbers *were*, not about what counts as abnormal.
 */

/** Below this, the reader is guessing; the reading is dropped, not trusted. */
export const CONFIDENCE_FLOOR = 0.9;

/**
 * Device faults the CV detector must stay out of.
 *
 * These are all statements about the *hardware*, and the reader is three
 * removes from it — it is looking at a rendering of a value that already
 * travelled over a socket. It cannot tell a frozen sensor from having sampled
 * the screen twice between two updates, or an unplugged probe from a dropped
 * frame, so anything it said about them would be noise. The server sees the
 * telemetry itself and owns these entirely.
 *
 * What the reader is genuinely qualified to judge is what the numbers on the
 * screen are doing: bands, trends, and the aggregate score.
 */
const DEVICE_KINDS = new Set(['flatline', 'signal_lost', 'implausible']);

export function createVisionDetector({ thresholds } = {}) {
  const detector = createDetector({ overrides: thresholds });
  let rejected = 0;
  let accepted = 0;

  return {
    /**
     * @param {object} values metric -> { value, value2, confidence }
     * @param {number} ts
     * @returns detector events, ready to send to the server
     */
    push(values, ts = Date.now()) {
      const events = [];
      for (const [metric, reading] of Object.entries(values)) {
        if (!reading || reading.value == null) continue;
        if (reading.confidence < CONFIDENCE_FLOOR) {
          // A misread digit reaching the detector would be far worse than a
          // dropped sample: the debounce window is short enough that a handful
          // of dropped frames costs nothing, while one confident "58" where
          // the screen said "98" is a false critical alert.
          rejected++;
          continue;
        }
        accepted++;
        events.push(
          ...detector
            .push({ metric, value: reading.value, value2: reading.value2, ts })
            .filter((e) => !DEVICE_KINDS.has(e.alert.kind)),
        );
      }
      return events;
    },
    // Deliberately no tick(): the shared detector's tick only reports devices
    // that have gone silent, which is a hardware fact the server owns.
    score: () => detector.score(),
    latest: () => detector.latest(),
    setContext: detector.setContext,
    stats: () => ({ accepted, rejected }),
  };
}
