import { METRICS, formatValue } from '@vitalwatch/shared/metrics.js';
import { severityFor } from '@vitalwatch/shared/bands.js';
import { drawDigit, toCells } from './segments.js';
import { getRoiLayout, WALL } from './roi.js';

/**
 * The vitals stream: a bedside-monitor display, rendered to a canvas and
 * published as a real MediaStream.
 *
 * This is the thing MediaPipe watches. Nothing here knows that — it just draws
 * a monitor — but two rendering decisions exist entirely for the reader's
 * benefit, and changing them means retraining:
 *
 *   1. Digits are seven-segment glyphs from segments.js, at the exact cell
 *      boxes roi.js publishes. No font, no layout engine, no drift.
 *   2. Digits are drawn in one fixed colour regardless of severity. Colouring
 *      an alarming value red would hand the classifier a second visual variable
 *      to cope with, so the *frame* around the panel carries severity instead.
 */

const COLOURS = {
  bg: '#0d1117',
  panel: '#161b22',
  panelEdge: '#232a33',
  label: '#7d8894',
  digitOn: '#e8f4ff',
  digitOff: 'rgba(255,255,255,0.055)',
  unit: '#7d8894',
  wave: '#3fb950',
  warning: '#d29922',
  critical: '#f85149',
  header: '#e8f4ff',
};

const WAVE_POINTS = 160;

/** Readings land at 1 Hz; this only needs to be smooth enough for the clock. */
const REPAINT_FPS = 10;

export function createVitalsWall({ fps = 30 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = WALL.width;
  canvas.height = WALL.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const layout = getRoiLayout();

  let patient = null;
  let latest = {};
  let specs = METRICS;
  let waves = {};
  let timer = null;
  let published = null;

  function draw() {
    ctx.fillStyle = COLOURS.bg;
    ctx.fillRect(0, 0, WALL.width, WALL.height);

    drawHeader();
    for (const field of layout.fields) drawField(field);
  }

  function drawHeader() {
    ctx.fillStyle = COLOURS.header;
    ctx.font = '600 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const name = patient?.name ?? 'Awaiting patient';
    ctx.fillText(name, 22, 36);

    if (patient?.room) {
      ctx.fillStyle = COLOURS.label;
      ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
      // Measured against the name just drawn, so the two never collide however
      // long the patient's name is.
      ctx.fillText(`Room ${patient.room}`, 22 + measure(ctx, name, '600 26px') + 18, 37);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = COLOURS.digitOn;
    ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(new Date().toLocaleTimeString('en-GB'), WALL.width - 22, 36);
  }

  function drawField(field) {
    const spec = specs[field.metric] ?? METRICS[field.metric];
    const reading = latest[field.metric];
    const severity = reading ? severityFor(spec, reading.value, reading.value2) : null;
    const { box } = field;

    ctx.fillStyle = COLOURS.panel;
    roundRect(ctx, box.x, box.y, box.w, box.h, 14);
    ctx.fill();

    // Severity lives on the panel border, never on the digits themselves.
    ctx.strokeStyle =
      severity === 'critical'
        ? COLOURS.critical
        : severity === 'warning'
          ? COLOURS.warning
          : COLOURS.panelEdge;
    ctx.lineWidth = severity ? 3 : 1;
    roundRect(ctx, box.x, box.y, box.w, box.h, 14);
    ctx.stroke();

    ctx.fillStyle = severity ? ctx.strokeStyle : COLOURS.label;
    ctx.font = '700 17px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(spec.label.toUpperCase(), field.label.x, field.label.y);

    // --- the digits ---
    const cells = {
      value: toCells(reading?.value, spec.digits, spec.decimals),
      value2: spec.dual ? toCells(reading?.value2, spec.digits2, spec.decimals) : [],
    };
    const cursor = { value: 0, value2: 0 };

    for (const cell of field.cells) {
      const digit = cells[cell.channel][cursor[cell.channel]++];
      drawDigit(ctx, digit, cell.x, cell.y, cell.w, cell.h, {
        on: COLOURS.digitOn,
        off: COLOURS.digitOff,
      });
    }

    if (field.point) {
      ctx.fillStyle = COLOURS.digitOn;
      ctx.beginPath();
      ctx.arc(field.point.x, field.point.y - field.point.size, field.point.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (field.slash) {
      ctx.strokeStyle = COLOURS.label;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(field.slash.x + field.slash.w - 6, field.slash.y + 8);
      ctx.lineTo(field.slash.x + 6, field.slash.y + field.slash.h - 8);
      ctx.stroke();
    }

    ctx.fillStyle = COLOURS.unit;
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(spec.unit, field.unit.x, field.unit.y);

    drawWave(field, severity);
  }

  function drawWave(field, severity) {
    const points = waves[field.metric];
    const { wave } = field;
    if (!points || points.length < 2) return;

    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const span = hi - lo || 1;

    ctx.strokeStyle =
      severity === 'critical'
        ? COLOURS.critical
        : severity === 'warning'
          ? COLOURS.warning
          : COLOURS.wave;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = wave.x + (i / (points.length - 1)) * wave.w;
      const y = wave.y + wave.h - ((v - lo) / span) * wave.h;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  return {
    canvas,
    layout,

    start() {
      /**
       * Repainted on a timer, not requestAnimationFrame.
       *
       * Browsers pause rAF entirely in a background tab. A ward station whose
       * display silently freezes the moment the nurse switches tabs — and
       * whose screen-reader therefore goes on reading a stale frame — is
       * exactly the failure this system exists to prevent. Timers are
       * throttled in the background rather than stopped, and readings only
       * arrive at 1 Hz, so a timer loses nothing and keeps painting.
       */
      clearInterval(timer);
      draw();
      timer = setInterval(draw, 1000 / REPAINT_FPS);

      const stream = canvas.captureStream(fps);
      for (const track of stream.getVideoTracks()) {
        /**
         * Tells the encoder this is text, not motion.
         *
         * Left alone, WebRTC trades resolution for framerate under bandwidth
         * pressure — a 1280x720 readout arrives as 640x360 or smaller, and
         * seven-segment digits stop being legible long before the picture looks
         * bad to a human. Since this feed exists to be *read*, detail is the
         * thing worth keeping and a low framerate costs nothing: the numbers
         * only change once a second.
         */
        track.contentHint = 'detail';
      }
      published = stream;
      return stream;
    },

    /**
     * The published stream, for re-publishing after the patient has been on a
     * shared screen or camera and switches back. Capturing the canvas a second
     * time would produce a different track, and the peer would have to
     * renegotiate for no reason.
     */
    stream: () => published,

    stop() {
      clearInterval(timer);
      timer = null;
    },

    setPatient(next, patientSpecs) {
      patient = next;
      if (patientSpecs) specs = patientSpecs;
    },

    /** Called once per telemetry frame. */
    update(nextLatest) {
      latest = nextLatest ?? {};
      for (const [metric, reading] of Object.entries(latest)) {
        if (!reading) continue;
        const series = (waves[metric] ??= []);
        series.push(reading.value);
        if (series.length > WAVE_POINTS) series.shift();
      }
      // Repaint immediately so a new reading is on the canvas — and therefore
      // readable by the reader — without waiting for the next timer tick.
      if (timer) draw();
    },
  };
}

function measure(ctx, text, font) {
  const previous = ctx.font;
  ctx.font = `${font} "Plus Jakarta Sans", system-ui, sans-serif`;
  const { width } = ctx.measureText(text);
  ctx.font = previous;
  return width;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { formatValue };
