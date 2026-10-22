import { readDigit } from './segmentReader.js';

/**
 * The reader. Runs off the main thread, because a nurse's vitals charts must
 * never stutter because a classifier is busy.
 *
 * Per frame: crop each digit cell out of the video frame, hand it to the
 * recognizer, and post back a label and a confidence per cell. It knows nothing
 * about metrics, bands or alerts — assembling digits into numbers and deciding
 * what they mean happens on the main thread.
 *
 * Two engines behind one interface:
 *   mediapipe — MediaPipe Tasks Vision ImageClassifier with our trained model
 *   segments  — the pixel-sampling seven-segment decoder, used until the model
 *               is built and kept afterwards as a cross-check
 */

const MODEL_URL = '/mediapipe/digits.task';
const WASM_ROOT = '/mediapipe/wasm';

/** Model input. Small on purpose: a seven-segment digit has very little to say. */
const INPUT = { w: 48, h: 64 };

let classifier = null;
let engine = 'segments';
let canvas = null;
let ctx = null;
/** Brightest pixel across the cells of the last frame. Surfaced to the debug
 *  hook so "the reader sees nothing" can be told apart from "the reader sees
 *  the wrong thing" without guessing. */
let lastPeakLuma = 0;

async function initMediapipe() {
  try {
    const head = await fetch(MODEL_URL, { method: 'HEAD' });
    if (!head.ok) throw new Error(`no model at ${MODEL_URL}`);

    const { FilesetResolver, ImageClassifier } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    classifier = await ImageClassifier.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      maxResults: 1,
    });
    engine = 'mediapipe';
  } catch (err) {
    // Not an error condition: a fresh clone has no trained model, and the
    // seven-segment decoder handles every frame correctly on its own.
    engine = 'segments';
    self.postMessage({ type: 'engine', engine, reason: err.message });
  }
}

const ready = initMediapipe();

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'frame') {
    await ready;
    const { bitmap, cells, ts, wall } = event.data;
    try {
      const predictions = classify(bitmap, cells, ts, wall);
      self.postMessage({
        type: 'predictions',
        predictions,
        engine,
        ts,
        frame: { w: bitmap.width, h: bitmap.height, peak: lastPeakLuma },
      });
    } finally {
      bitmap.close();
    }
  }
};

function classify(bitmap, cells, ts, wall) {
  canvas ??= new OffscreenCanvas(INPUT.w, INPUT.h);
  ctx ??= canvas.getContext('2d', { willReadFrequently: true });

  /**
   * Crop boxes arrive in the wall's own coordinate space, but the frame may not
   * be that size. WebRTC rescales a track freely to fit the available
   * bandwidth — a 1280x720 screen routinely arrives as 640x360 — and cropping
   * unscaled coordinates out of a smaller frame samples the top-left quadrant,
   * which reads as a screen full of blanks rather than as an error.
   */
  const sx = wall ? bitmap.width / wall.width : 1;
  const sy = wall ? bitmap.height / wall.height : 1;

  const out = {};
  lastPeakLuma = 0;
  for (const cell of cells) {
    // Every cell is scaled to one fixed input size, so the recognizer sees the
    // same geometry whatever resolution the frame arrived at.
    ctx.drawImage(
      bitmap,
      cell.x * sx,
      cell.y * sy,
      cell.w * sx,
      cell.h * sy,
      0,
      0,
      INPUT.w,
      INPUT.h,
    );

    let prediction;
    if (classifier) {
      const result = classifier.classifyForVideo(canvas, ts);
      const top = result?.classifications?.[0]?.categories?.[0];
      prediction = top
        ? { label: top.categoryName, score: top.score }
        : { label: 'unknown', score: 0 };
    } else {
      const image = ctx.getImageData(0, 0, INPUT.w, INPUT.h);
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i] > lastPeakLuma) lastPeakLuma = image.data[i];
      }
      prediction = readDigit(image);
    }

    out[`${cell.metric}:${cell.index}`] = prediction;
  }
  return out;
}
