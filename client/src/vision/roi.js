import { METRIC_ORDER, METRICS } from '@vitalwatch/shared/metrics.js';
import { isPlausible } from '@vitalwatch/shared/bands.js';

/**
 * The layout contract between the renderer and the reader.
 *
 * `vitalsWall.js` draws the stream from this, and `digitReader.worker.js` crops
 * from this. Because both derive their geometry from one function, a change to
 * the wall's layout moves the crop boxes with it and the two can never drift
 * apart — which is the failure mode that would otherwise make a screen-reading
 * pipeline quietly start reporting nonsense.
 */

export const WALL = { width: 1280, height: 720 };

const HEADER_H = 72;
const COLS = 3;
const ROWS = 2;
const GUTTER = 16;

const FIELD_W = Math.floor((WALL.width - GUTTER * (COLS + 1)) / COLS);
const FIELD_H = Math.floor((WALL.height - HEADER_H - GUTTER * (ROWS + 1)) / ROWS);

const PAD = 22;
const LABEL_H = 34;
const WAVE_H = 56;

/** Digit cells are smaller for a dual reading, which has to fit two groups. */
const CELL = {
  single: { w: 78, h: 112, gap: 12 },
  dual: { w: 44, h: 68, gap: 8 },
};

/** Extra space where a decimal point is drawn (never classified). */
const POINT_W = 22;
/** Extra space for the slash between systolic and diastolic. */
const SLASH_W = 26;

/**
 * Full geometry of the wall.
 * @returns {{wall: object, header: object, fields: Field[]}}
 *
 * @typedef {object} Field
 * @property {string} metric
 * @property {{x:number,y:number,w:number,h:number}} box       whole panel
 * @property {{x:number,y:number,w:number,h:number}} wave      waveform strip
 * @property {Cell[]} cells                                    every digit cell
 * @property {{x:number,y:number,size:number}|null} point      decimal point
 * @property {{x:number,y:number,w:number,h:number}|null} slash
 *
 * @typedef {object} Cell
 * @property {string} metric
 * @property {number} index   position within the field, left to right
 * @property {'value'|'value2'} channel
 * @property {number} place   0 = units, 1 = tens, …  (before the decimal shift)
 * @property {number} x @property {number} y @property {number} w @property {number} h
 */
export function getRoiLayout() {
  const fields = METRIC_ORDER.map((metric, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const box = {
      x: GUTTER + col * (FIELD_W + GUTTER),
      y: HEADER_H + GUTTER + row * (FIELD_H + GUTTER),
      w: FIELD_W,
      h: FIELD_H,
    };
    return layoutField(METRICS[metric], box);
  });

  return {
    wall: WALL,
    header: { x: 0, y: 0, w: WALL.width, h: HEADER_H },
    fields,
  };
}

function layoutField(spec, box) {
  const cell = spec.dual ? CELL.dual : CELL.single;
  const originY = box.y + PAD + LABEL_H;

  const groups = spec.dual
    ? [
        { channel: 'value', digits: spec.digits },
        { channel: 'value2', digits: spec.digits2 },
      ]
    : [{ channel: 'value', digits: spec.digits }];

  // Measure first so the whole readout can be centred in its panel.
  let width = 0;
  groups.forEach((g, gi) => {
    if (gi) width += SLASH_W;
    width += g.digits * cell.w + (g.digits - 1) * cell.gap;
  });
  if (spec.decimals) width += POINT_W;

  let x = box.x + Math.round((box.w - width) / 2);
  const cells = [];
  let point = null;
  let slash = null;
  let index = 0;

  groups.forEach((group, gi) => {
    if (gi) {
      slash = { x, y: originY, w: SLASH_W, h: cell.h };
      x += SLASH_W;
    }

    for (let d = 0; d < group.digits; d++) {
      cells.push({
        metric: spec.key,
        index: index++,
        channel: group.channel,
        place: group.digits - 1 - d,
        x,
        y: originY,
        w: cell.w,
        h: cell.h,
      });
      x += cell.w;

      // The point sits between the last integer digit and the first decimal.
      const isPointHere = spec.decimals && d === group.digits - spec.decimals - 1;
      if (isPointHere) {
        point = { x: x + POINT_W / 2, y: originY + cell.h, size: Math.round(cell.w * 0.14) };
        x += POINT_W;
      } else if (d < group.digits - 1) {
        x += cell.gap;
      }
    }
  });

  return {
    metric: spec.key,
    box,
    label: { x: box.x + PAD, y: box.y + PAD },
    // Below the digits rather than beside them. A dual reading like 111/77
    // spans almost the full panel, so a right-aligned unit on the same line
    // collides with the last digit — and a unit label overlapping a number is
    // exactly the kind of thing the reader would then have to cope with.
    unit: { x: box.x + box.w - PAD, y: box.y + box.h - PAD - WAVE_H - 10 },
    wave: {
      x: box.x + PAD,
      y: box.y + box.h - PAD - WAVE_H,
      w: box.w - PAD * 2,
      h: WAVE_H,
    },
    cells,
    point,
    slash,
  };
}

/** Every digit cell on the wall, flattened — what the reader iterates. */
export function allCells(layout = getRoiLayout()) {
  return layout.fields.flatMap((f) => f.cells);
}

/**
 * Reassemble the digits the classifier returned back into numbers.
 * Blanks are leading padding; a blank *between* digits means the reader lost a
 * cell, and the whole field is discarded rather than silently misread.
 */
export function cellsToValues(field, predictions) {
  const spec = METRICS[field.metric];
  const out = {};
  for (const channel of ['value', 'value2']) {
    const cells = field.cells.filter((c) => c.channel === channel);
    if (!cells.length) continue;

    let text = '';
    let seenDigit = false;
    let broken = false;

    for (const c of cells) {
      const p = predictions[c.index];
      if (!p || p.label === 'blank') {
        if (seenDigit) broken = true; // a hole in the middle of a number
        continue;
      }
      // Anything that is not a digit — 'unknown' from a cell the recogniser
      // could not resolve — invalidates the whole field. Concatenating it
      // produced strings like "12unknown" that became NaN and travelled on as
      // a reading, which is far worse than admitting the field was unreadable.
      if (!/^[0-9]$/.test(p.label)) {
        broken = true;
        continue;
      }
      seenDigit = true;
      text += p.label;
    }

    if (broken || !text) {
      out[channel] = null;
      continue;
    }
    const value = Number(text) / 10 ** spec.decimals;
    out[channel] = Number.isFinite(value) ? value : null;
  }

  /**
   * A number no device could display is a misread, by definition.
   *
   * A single softened segment turns 100 into 101 on an SpO₂ readout, which is
   * physically impossible — saturation cannot exceed 100%. Letting it through
   * meant the reader reported a value it should have known was wrong, and the
   * clinical detector had to catch it downstream. Refusing here is both earlier
   * and more honest, and it keeps the accuracy figure measuring recognition
   * rather than counting errors the reader could have spotted itself.
   */
  if (out.value != null && !isPlausible(spec, out.value, out.value2)) {
    out.value = null;
    if (spec.dual) out.value2 = null;
  }
  return out;
}
