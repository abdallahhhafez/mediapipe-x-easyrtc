"""
Mirror of client/src/vision/segments.js.

The classifier only ever sees digits drawn by the vitals wall, so its training
set is drawn the same way — from the same geometry, not from a font. Sharing a
formula rather than a TTF means the browser rasteriser and Pillow cannot
disagree about what a "7" looks like, and there is no font to ship or license.

If you change one of these two files, change the other and retrain.
"""

DIGIT_SEGMENTS = {
    "0": "abcdef",
    "1": "bc",
    "2": "abged",
    "3": "abgcd",
    "4": "fgbc",
    "5": "afgcd",
    "6": "afgecd",
    "7": "abc",
    "8": "abcdefg",
    "9": "abfgcd",
}

CLASSES = [*"0123456789", "blank"]

# Straight from vitalsWall.js COLOURS. The unlit segments matter as much as the
# lit ones: they are what stops the model learning "dark everywhere = blank".
COLOUR_ON = (232, 244, 255)
COLOUR_OFF_ALPHA = 0.055
COLOUR_PANEL = (22, 27, 34)


def segment_rects(w, h, t):
    """Segment rectangles in cell-local coordinates. Mirrors segmentRects()."""
    gap = t * 0.55
    half_h = h / 2
    return {
        "a": (gap, 0, w - 2 * gap, t),
        "b": (w - t, gap, t, half_h - 1.5 * gap),
        "c": (w - t, half_h + 0.5 * gap, t, half_h - 1.5 * gap),
        "d": (gap, h - t, w - 2 * gap, t),
        "e": (0, half_h + 0.5 * gap, t, half_h - 1.5 * gap),
        "f": (0, gap, t, half_h - 1.5 * gap),
        "g": (gap, half_h - t / 2, w - 2 * gap, t),
    }


def blend(fg, bg, alpha):
    return tuple(round(f * alpha + b * (1 - alpha)) for f, b in zip(fg, bg))


COLOUR_OFF = blend((255, 255, 255), COLOUR_PANEL, COLOUR_OFF_ALPHA)


def draw_digit(draw, digit, x, y, w, h, thickness=None):
    """Draw one cell onto a Pillow ImageDraw. Mirrors drawDigit()."""
    t = thickness if thickness is not None else round(h * 0.13)
    lit = "" if digit in (None, "blank") else DIGIT_SEGMENTS[str(digit)]
    for name, (rx, ry, rw, rh) in segment_rects(w, h, t).items():
        colour = COLOUR_ON if name in lit else COLOUR_OFF
        draw.rectangle([x + rx, y + ry, x + rx + rw, y + ry + rh], fill=colour)
