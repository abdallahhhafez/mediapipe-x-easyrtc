import { DIGIT_SEGMENTS, segmentRects } from './segments.js';

/**
 * A seven-segment decoder that works by sampling pixels.
 *
 * This is the reference recognizer. It reads a digit the way a photodiode
 * array would — threshold the crop, look at where each of the seven segments
 * would be, decide which are lit — with no model and no training.
 *
 * It earns its place three times over:
 *
 *   1. The whole pipeline (crop → recognise → change detection → alert) is
 *      testable before any model exists, and it is real image processing, not
 *      a stub that returns the answer it was handed.
 *   2. It is the fallback when `digits.task` has not been built yet, so a fresh
 *      clone runs end to end without a Python toolchain.
 *   3. It is an independent second opinion to score the trained classifier
 *      against, on live frames rather than a held-out split.
 */

/** Luminance of a fully lit segment and of the panel behind an unlit one. */
const LUM_ON = 232;
const LUM_OFF = 35;

/** Fraction of each segment rectangle sampled, centred — avoids the edges. */
const SAMPLE_INSET = 0.3;

/**
 * Margin, in squared-error units, at which a match is considered unambiguous.
 * Two digits differ by at least one segment, which over a compressed feed
 * separates their costs by roughly 0.7 — so 0.5 treats a clearly-correct but
 * softened digit as certain, while genuinely torn cases still score low.
 */
const DECISIVE_MARGIN = 0.5;

/** Squared error at which even the best-fitting template is a bad explanation. */
const POOR_FIT = 2.5;

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/**
 * Every digit, plus `blank`, as a 7-vector of expected segment states.
 *
 * `blank` has to be a template like the rest. Scoring it separately — "is the
 * total brightness under a threshold" — gave an empty cell a confidence near
 * zero once the feed was compressed, because unlit segments still glow a
 * little. Field confidence is the minimum across its cells, so a single
 * blank-padded leading digit dragged every reading below the gate and the
 * reader abstained on all of them.
 */
const TEMPLATES = [
  ...Object.entries(DIGIT_SEGMENTS).map(([digit, segs]) => ({
    digit,
    on: SEGMENTS.map((s) => (segs.includes(s) ? 1 : 0)),
  })),
  { digit: 'blank', on: SEGMENTS.map(() => 0) },
];

/**
 * @param {ImageData} image a single digit cell
 * @returns {{label: string, score: number}}
 */
export function readDigit(image) {
  const { width: w, height: h, data } = image;
  const t = Math.round(h * 0.13);
  const rects = segmentRects(w, h, t);

  /**
   * How lit each segment is, 0–1, rather than a yes/no.
   *
   * A hard threshold was fine while the reader sampled a canvas directly. Over
   * a compressed video track it is not: the encoder softens segment edges, a
   * genuinely lit segment lands near the threshold, and the resulting pattern
   * matches no digit at all — so the cell came back "unknown" and the whole
   * reading was thrown away. Keeping the analogue value lets the digit be
   * chosen by best fit, and lets the confidence reflect how good that fit was.
   */
  const observed = SEGMENTS.map((name) => {
    const lum = sampleMean(data, w, h, rects[name]);
    return clamp01((lum - LUM_OFF) / (LUM_ON - LUM_OFF));
  });

  const scored = TEMPLATES.map((tpl) => ({
    digit: tpl.digit,
    // Squared error over the seven segments; 0 is a perfect match.
    cost: tpl.on.reduce((sum, expected, i) => sum + (observed[i] - expected) ** 2, 0),
  })).sort((a, b) => a.cost - b.cost);

  const [best, runnerUp] = scored;

  /**
   * Confidence combines two questions, because either alone is misleading.
   *
   * The gap to the next-best candidate asks "could this plausibly have been a
   * different number" — a slightly blurry 7 that nothing else comes close to is
   * safe, while a crisp cell torn between 8 and 9 is not.
   *
   * The absolute fit asks "is this a digit at all" — a grey placeholder frame
   * sits far from every template but happens to be nearest to 1, which without
   * this term would be reported as a confident 1.
   */
  const margin = runnerUp.cost - best.cost;
  const score = clamp01(margin / DECISIVE_MARGIN) * clamp01(1 - best.cost / POOR_FIT);

  return { label: best.digit, score };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function sampleMean(data, w, h, [rx, ry, rw, rh]) {
  const insetX = rw * SAMPLE_INSET;
  const insetY = rh * SAMPLE_INSET;
  const x0 = Math.max(0, Math.round(rx + insetX));
  const x1 = Math.min(w, Math.round(rx + rw - insetX));
  const y0 = Math.max(0, Math.round(ry + insetY));
  const y1 = Math.min(h, Math.round(ry + rh - insetY));

  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      // Rec. 601 luma — the digits are near-white on near-black, so any sane
      // weighting works, but this keeps it honest for the coloured panels.
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
  }
  return n ? sum / n : 0;
}
