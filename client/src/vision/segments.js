/**
 * Seven-segment digits, drawn from geometry rather than typed in a font.
 *
 * The digits on the vitals stream have to be reproduced exactly twice: once by
 * the canvas that renders the stream, and once by the Python script that
 * generates the classifier's training set. Sharing a *font* across those two
 * runtimes means shipping and licensing a TTF and hoping the rasterisers agree.
 * Sharing a *formula* means they cannot disagree — and it happens to be what a
 * real bedside monitor's readout looks like anyway.
 *
 * tools/digit-model/segments.py is the mirror of this file. Change one, change
 * both, and retrain.
 */

/** Which of the seven segments are lit for each digit. */
export const DIGIT_SEGMENTS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgecd',
  7: 'abc',
  8: 'abcdefg',
  9: 'abfgcd',
};

/** The classifier's label set. `blank` is a real class: a two-digit value in a
 *  three-cell field leaves its leading cell empty, exactly as a monitor does. */
export const CLASSES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'blank'];

/**
 * Segment rectangles for a digit of size w×h with stroke thickness t.
 * Returned in cell-local coordinates, so a caller only has to translate.
 */
export function segmentRects(w, h, t) {
  const gap = t * 0.55; // keeps neighbouring segments from fusing into a blob
  const halfH = h / 2;

  return {
    a: [gap, 0, w - 2 * gap, t],
    b: [w - t, gap, t, halfH - 1.5 * gap],
    c: [w - t, halfH + 0.5 * gap, t, halfH - 1.5 * gap],
    d: [gap, h - t, w - 2 * gap, t],
    e: [0, halfH + 0.5 * gap, t, halfH - 1.5 * gap],
    f: [0, gap, t, halfH - 1.5 * gap],
    g: [gap, halfH - t / 2, w - 2 * gap, t],
  };
}

/**
 * Draw one digit cell.
 *
 * Unlit segments are drawn too, very faintly — that is what a real seven-segment
 * display looks like, and it gives the classifier a consistent background
 * instead of learning "dark pixels anywhere = blank".
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string|number|null} digit `0`–`9`, or null/'blank' for an empty cell
 */
export function drawDigit(ctx, digit, x, y, w, h, { on, off, thickness } = {}) {
  const t = thickness ?? Math.round(h * 0.13);
  const rects = segmentRects(w, h, t);
  const lit = digit == null || digit === 'blank' ? '' : DIGIT_SEGMENTS[String(digit)] ?? '';

  for (const [name, [rx, ry, rw, rh]] of Object.entries(rects)) {
    ctx.fillStyle = lit.includes(name) ? (on ?? '#eaf7ff') : (off ?? 'rgba(255,255,255,0.055)');
    ctx.fillRect(x + rx, y + ry, rw, rh);
  }
}

/**
 * Split a value into fixed-width digit cells, blank-padded on the left.
 * `72` in a three-cell field is `['blank','7','2']` — never `'072'`.
 */
export function toCells(value, digits, decimals) {
  if (value == null || Number.isNaN(value)) return Array(digits).fill('blank');
  const scaled = Math.round(Math.abs(value) * 10 ** decimals);
  const text = String(scaled);
  if (text.length > digits) return text.slice(-digits).split(''); // overflow: show the low digits
  return [...Array(digits - text.length).fill('blank'), ...text.split('')];
}
