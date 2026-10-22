/**
 * Colour maths for the themable palette.
 *
 * One picked accent has to produce a whole working palette — tints to sit on,
 * a shade dark enough to read as text, a deep surface for the hero card, and
 * neutrals that lean the same way. Doing that in sRGB gives muddy, uneven
 * results (equal steps don't *look* equal), so everything derived here goes
 * through OKLCH, which is perceptually uniform: fix the lightness and the
 * result reads as equally light whatever the hue.
 */

/* ── sRGB ⇄ OKLCH ────────────────────────────────────────── */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const HEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

function hexToRgb(hex) {
  const m = HEX.exec(hex || '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : null;
}

const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C: Math.hypot(A, B), h };
}

export function oklchToHex({ L, C, h }) {
  const hr = (h * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgbToHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(linearToSrgb)
  );
}

/**
 * Not every OKLCH triple exists in sRGB. Asking for a vivid mid-blue at 95%
 * lightness silently clips to something else entirely, so walk the chroma down
 * until the colour survives a round-trip — the lightness we asked for is the
 * part that matters for contrast, and it's the part clipping would destroy.
 */
function gamutFit({ L, C, h }) {
  let c = Math.min(C, 0.37);
  for (let i = 0; i < 60 && c > 0; i++) {
    const hex = oklchToHex({ L, C: c, h });
    const back = hexToOklch(hex);
    if (Math.abs(back.L - L) < 0.012 && Math.abs(back.C - c) < 0.012) return hex;
    c -= 0.005;
  }
  return oklchToHex({ L, C: 0, h });
}

/* ── Public helpers ──────────────────────────────────────── */

export const isValidHex = (hex) => /^#[0-9a-f]{6}$/i.test(hex || '');

/**
 * Pick a readable "ink" text colour for whatever accent is chosen.
 *
 * The accent hex is arbitrary once branding is customizable, so the fixed
 * default (#1F2408, tuned for lime) would go unreadable against a dark pick.
 * Relative luminance (WCAG formula) decides between the app's near-black ink
 * and a light near-white instead.
 */
export function contrastingInk(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#1F2408';
  const [r, g, b] = rgb.map(srgbToLinear);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#181713' : '#F4F4F2';
}

/**
 * The full palette one accent implies.
 *
 * Lightness targets are fixed and hue-independent, which is what keeps the
 * result predictable for *any* colour a patient or clinic picks: `deep` always
 * clears 4.5:1 on both white and its own `soft` tint, and `surface` always
 * clears 4.5:1 against white text — verified across the presets plus hostile
 * edges (pure red, near-black, flat grey).
 *
 * Chroma is scaled from the source rather than fixed, so a muted accent yields
 * a muted palette and a vivid one stays vivid instead of every choice being
 * flattened to the same intensity.
 */
export function derivePalette(accent) {
  const base = hexToOklch(accent);
  if (!base) return null;
  const { h, C } = base;
  const at = (L, c) => gamutFit({ L, C: c, h });

  return {
    accent,
    accentInk: contrastingInk(accent),
    // Tuned to read as tinted on a white card, not just against the canvas —
    // most of the tiles using it sit inside cards.
    accentSoft: at(0.94, Math.min(C * 0.42, 0.062)),
    accentMuted: at(0.9, Math.min(C * 0.45, 0.08)), // hairlines on accent surfaces
    accentDeep: at(0.46, Math.min(C * 0.9, 0.15)), // text and icons on `accentSoft`
    accentSurface: at(0.3, Math.min(C * 0.62, 0.09)), // the one saturated dark surface
    // Neutrals lean a few thousandths of chroma toward the accent so the page
    // reads as one palette rather than a coloured widget dropped on grey.
    canvas: at(0.938, Math.min(C * 0.06, 0.008)),
    sunken: at(0.963, Math.min(C * 0.08, 0.011)),
    hairline: at(0.9, Math.min(C * 0.1, 0.014)),
  };
}

/**
 * Okabe & Ito's qualitative palette (2008) — the reference set for categorical
 * colour that stays separable under protanopia, deuteranopia and tritanopia.
 * Offered as the accent choices when a patient turns on the accessible theme.
 */
export const CVD_SAFE_ACCENTS = [
  '#0072B2', // blue
  '#009E73', // bluish green
  '#56B4E9', // sky blue
  '#E69F00', // orange
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#F0E442', // yellow
];
