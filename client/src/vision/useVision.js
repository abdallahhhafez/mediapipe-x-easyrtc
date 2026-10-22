import { useCallback, useEffect, useRef, useState } from 'react';
import { getRoiLayout, allCells, cellsToValues } from './roi.js';
import { createVisionDetector } from './changeDetector.js';
import { createAccuracyMonitor } from './accuracy.js';
import { getSocket } from '../lib/socket';

/**
 * The whole vision loop, as one hook.
 *
 *   stream frame  →  worker (crop + classify)  →  digits
 *                →  numbers  →  change detector  →  alerts  →  server
 *                           ↘  accuracy monitor (vs. telemetry)
 *
 * See `attach` below for why frames are sampled the way they are.
 */

/** The wall only changes once a second; classifying 30 fps would burn battery. */
const TARGET_FPS = 10;

export function useVision({ patientId, thresholds, truth, enabled = true }) {
  const [predictions, setPredictions] = useState({});
  const [values, setValues] = useState({});
  const [engine, setEngine] = useState('starting');
  const [stats, setStats] = useState(null);

  const workerRef = useRef(null);
  const detectorRef = useRef(null);
  const accuracyRef = useRef(null);
  const sourceRef = useRef(null);
  const truthRef = useRef(truth);
  const capturedTruth = useRef(null);
  const lastDetectorPush = useRef(0);
  const busy = useRef(false);
  const lastAt = useRef(-1);
  const timerRef = useRef(null);
  const frameInfo = useRef(null);
  const layout = useRef(getRoiLayout());
  const cells = useRef(allCells(layout.current));

  // The accuracy monitor needs the telemetry as of the frame it is scoring, and
  // re-creating the frame loop on every reading would defeat the point.
  truthRef.current = truth;

  useEffect(() => {
    if (!enabled) return;

    detectorRef.current = createVisionDetector({ thresholds });
    accuracyRef.current = createAccuracyMonitor();

    const worker = new Worker(new URL('./digitReader.worker.js', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'engine') return setEngine(event.data.engine);
      if (type !== 'predictions') return;

      setEngine(event.data.engine);
      busy.current = false;
      frameInfo.current = event.data.frame;
      handlePredictions(event.data.predictions, event.data.ts);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, patientId]);

  const handlePredictions = useCallback(
    (preds, ts) => {
      setPredictions(preds);

      // Digits back into numbers, per field.
      const read = {};
      for (const field of layout.current.fields) {
        const byIndex = {};
        let minScore = 1;
        for (const cell of field.cells) {
          const p = preds[`${cell.metric}:${cell.index}`];
          byIndex[cell.index] = p;
          if (p) minScore = Math.min(minScore, p.score);
        }
        const { value, value2 } = cellsToValues(field, byIndex);
        read[field.metric] = { value, value2, confidence: value == null ? 0 : minScore };
      }
      setValues(read);

      // Scored against the telemetry as it was when the frame was *captured*,
      // not as it is now. A capture-to-prediction round trip spans tens of
      // milliseconds and readings land every second, so comparing against the
      // current values charges the reader for a mismatch every time a new
      // reading arrived while it was working — which reads as ~25% accuracy
      // for a reader that is in fact getting every digit right.
      accuracyRef.current?.compare(capturedTruth.current ?? {}, read, Date.now());

      /**
       * The detector is fed at 1 Hz even though the reader runs at 10.
       *
       * Its debounce ("abnormal in 5 of the last 8") and its trend windows are
       * counted in samples, and every threshold was tuned against 1 Hz
       * telemetry. Feeding it every read would shrink "5 consecutive samples"
       * from five seconds to half a second, and the server and CV detectors
       * would disagree about the same event purely because one was sampled
       * faster. The extra reads still count toward accuracy and the overlay —
       * they just do not each get a vote.
       */
      const now = Date.now();
      const due = now - lastDetectorPush.current >= 1000;
      const events = due ? (detectorRef.current?.push(read, now) ?? []) : [];
      if (due) lastDetectorPush.current = now;

      if (events.length && patientId) {
        // Alerts the CV found go to the server, where they are persisted beside
        // the ones the rules engine found from the same event.
        getSocket().emit('vision:alerts', { patientId, events });
      }

      const next = {
        ...accuracyRef.current.stats(),
        detector: detectorRef.current.stats(),
        score: detectorRef.current.score(),
      };
      setStats(next);

      // A window onto the reader, for debugging a misread against the frame
      // that caused it. The ROI overlay shows the same data visually; this is
      // what you reach for when the question is "what exactly did it return".
      if (import.meta.env.DEV) {
        window.__vision = {
          predictions: preds,
          values: read,
          truth: truthRef.current,
          stats: next,
          frame: frameInfo.current,
        };
      }
    },
    [patientId],
  );

  /**
   * Attach to the source the vitals stream is generated from.
   *
   * Two decisions here are load-bearing and both were forced by measurement
   * rather than preference.
   *
   * **The loop is timed off a plain timer, not requestVideoFrameCallback.**
   * rVFC is the natural fit on paper, but browsers do not reliably fire it for
   * a MediaStream produced by canvas.captureStream() — it can stay silent
   * indefinitely on a stream that is visibly playing.
   *
   * **Frames are read from the wall's canvas, not from the <video> element.**
   * The <video> displays the stream correctly, but reading pixels back out of
   * it is unreliable for a canvas-sourced stream: currentTime stays frozen and
   * createImageBitmap() returns whatever frame was last decoded, which in
   * practice is a stale one from before the readings arrived. The reader would
   * then sit at 100% "blank" forever while the nurse watches a perfectly
   * correct display — a failure that hides itself.
   *
   * The canvas is the stream's own source, so these are the exact pixels being
   * broadcast, frame for frame. Nothing about what the reader sees changes;
   * only where it is sampled from.
   */
  const attach = useCallback(
    (getSource) => {
      // A getter, not the canvas itself. React mounts, unmounts and remounts in
      // development, which leaves the caller holding a fresh wall each time —
      // and a snapshot taken during the first mount points at a canvas that has
      // since been stopped. Stopped canvases keep their last painted frame, so
      // the reader would go on happily reading a frozen picture.
      sourceRef.current = getSource;
      clearInterval(timerRef.current);
      if (!getSource || !enabled) return;

      timerRef.current = setInterval(async () => {
        const el = sourceRef.current?.();
        const worker = workerRef.current;
        // The worker is created by an effect in the parent, which runs after
        // this child's — so the first few ticks may find nothing to post to.
        if (!el || !worker || busy.current) return;
        /**
         * A remote track serves grey placeholder frames between being attached
         * and the first decoded picture arriving. Those have just enough
         * brightness to look like a very dim "1" in every cell, which is a
         * confident wrong number rather than an obvious blank — so nothing is
         * read until the element genuinely has a frame.
         */
        if (el instanceof HTMLVideoElement && (el.readyState < 2 || !el.videoWidth)) return;

        busy.current = true;
        try {
          const bitmap = await createImageBitmap(el);
          // Pin the telemetry that produced these pixels. Only one frame is
          // ever in flight (the `busy` guard), so a single slot is enough.
          capturedTruth.current = truthRef.current;
          // Monotonic and always advancing, which classifyForVideo requires.
          lastAt.current = Math.max(lastAt.current + 1, performance.now() | 0);
          worker.postMessage(
            {
              type: 'frame',
              bitmap,
              cells: cells.current,
              ts: lastAt.current,
              // The crop boxes are in wall coordinates; the worker rescales
              // them to whatever size the frame actually arrived at.
              wall: layout.current.wall,
            },
            [bitmap],
          );
        } catch {
          busy.current = false;
        }
      }, 1000 / TARGET_FPS);
    },
    [enabled],
  );

  useEffect(() => () => clearInterval(timerRef.current), []);

  return { attach, predictions, values, engine, stats };
}
