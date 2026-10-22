"""
Build the classifier's training set.

    python generate_dataset.py --per-class 2000 --out dataset

Every image is a digit cell exactly as the vitals wall draws it, then degraded
the way the real pipeline degrades it before the model sees it: rescaled to the
reader's 48x64 input from a range of source cell sizes, nudged sub-pixel,
blurred, and noised.

The augmentation is not decoration. Without it the model learns pixel-perfect
templates and then fails the moment a browser rasterises an edge half a shade
differently, which is precisely the condition it will be deployed under.
"""

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from segments import CLASSES, COLOUR_PANEL, draw_digit

# The reader's input size — see INPUT in digitReader.worker.js.
INPUT_W, INPUT_H = 48, 64

# Cell sizes the wall actually uses (CELL.single and CELL.dual in roi.js).
SOURCE_CELLS = [(78, 112), (44, 68)]


def render(digit, rng):
    """One augmented sample, at the size the reader will hand the model."""
    src_w, src_h = rng.choice(SOURCE_CELLS)

    # Render on a slightly larger canvas so a sub-pixel offset has room to move
    # into rather than clipping the glyph.
    pad = 6
    img = Image.new("RGB", (src_w + pad * 2, src_h + pad * 2), COLOUR_PANEL)
    draw = ImageDraw.Draw(img)

    dx = rng.uniform(-2.0, 2.0)
    dy = rng.uniform(-2.0, 2.0)
    scale = rng.uniform(0.96, 1.04)
    thickness = round(src_h * 0.13 * rng.uniform(0.93, 1.07))

    draw_digit(
        draw,
        digit,
        pad + dx,
        pad + dy,
        src_w * scale,
        src_h * scale,
        thickness=thickness,
    )

    # Crop back to the nominal cell, then resample to the reader's input size —
    # the same two-step the worker performs on a live frame.
    img = img.crop((pad, pad, pad + src_w, pad + src_h))
    img = img.resize((INPUT_W, INPUT_H), Image.BILINEAR)

    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.2, 0.9)))

    if rng.random() < 0.7:
        img = add_noise(img, rng, amount=rng.uniform(2, 10))

    if rng.random() < 0.5:
        img = adjust(img, rng.uniform(0.88, 1.12), rng.randint(-12, 12))

    return img


def add_noise(img, rng, amount):
    px = img.load()
    for _ in range(int(img.width * img.height * 0.25)):
        x = rng.randrange(img.width)
        y = rng.randrange(img.height)
        r, g, b = px[x, y]
        n = rng.gauss(0, amount)
        px[x, y] = (clamp(r + n), clamp(g + n), clamp(b + n))
    return img


def adjust(img, gain, bias):
    return img.point(lambda v: clamp(v * gain + bias))


def clamp(v):
    return max(0, min(255, int(v)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=2000)
    ap.add_argument("--out", type=Path, default=Path("dataset"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    rng = random.Random(args.seed)

    for label in CLASSES:
        folder = args.out / label
        folder.mkdir(parents=True, exist_ok=True)
        for i in range(args.per_class):
            render(label, rng).save(folder / f"{i:05d}.png")
        print(f"  {label}: {args.per_class} images")

    print(f"\nWrote {len(CLASSES) * args.per_class} images to {args.out}/")


if __name__ == "__main__":
    main()
