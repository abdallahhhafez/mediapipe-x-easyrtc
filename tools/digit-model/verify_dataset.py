"""
Check that the Python renderer and the browser renderer still agree.

    python generate_dataset.py --per-class 40 --out /tmp/ds
    python verify_dataset.py --data /tmp/ds

segments.py and segments.js are two implementations of one formula, and nothing
enforces that they stay in step — a change to one that is not mirrored in the
other silently trains the model on glyphs the wall does not draw, and the reader
starts misreading in production with no error anywhere.

This decodes the generated images with a port of segmentReader.js. If the Python
renderer drifts from what the JavaScript decoder expects, the accuracy here
drops and the mismatch says which digit moved. Run it before training.
"""

import argparse
from collections import Counter
from pathlib import Path

from PIL import Image

from segments import CLASSES, DIGIT_SEGMENTS, segment_rects

LIT_THRESHOLD = 120  # segmentReader.js LIT_THRESHOLD
SAMPLE_INSET = 0.3  # segmentReader.js SAMPLE_INSET

PATTERN_TO_DIGIT = {"".join(sorted(v)): k for k, v in DIGIT_SEGMENTS.items()}


def read_digit(img):
    """Port of segmentReader.js#readDigit."""
    px = img.convert("RGB").load()
    w, h = img.size
    t = round(h * 0.13)
    lit = []

    for name, (rx, ry, rw, rh) in segment_rects(w, h, t).items():
        inset_x, inset_y = rw * SAMPLE_INSET, rh * SAMPLE_INSET
        xs = range(max(0, round(rx + inset_x)), min(w, round(rx + rw - inset_x)))
        ys = range(max(0, round(ry + inset_y)), min(h, round(ry + rh - inset_y)))
        values = [
            0.299 * px[x, y][0] + 0.587 * px[x, y][1] + 0.114 * px[x, y][2]
            for y in ys
            for x in xs
        ]
        if values and sum(values) / len(values) >= LIT_THRESHOLD:
            lit.append(name)

    if not lit:
        return "blank"
    return PATTERN_TO_DIGIT.get("".join(sorted(lit)), "unknown")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("dataset"))
    ap.add_argument("--gate", type=float, default=0.99)
    args = ap.parse_args()

    total = correct = 0
    mismatches = Counter()

    for label in CLASSES:
        for path in sorted((args.data / label).glob("*.png")):
            total += 1
            got = read_digit(Image.open(path))
            if got == label:
                correct += 1
            else:
                mismatches[f"{label} read as {got}"] += 1

    if not total:
        raise SystemExit(f"no images under {args.data}/ — run generate_dataset.py first")

    rate = correct / total
    print(f"decoded {correct}/{total} ({rate:.2%})")
    for pair, n in mismatches.most_common(10):
        print(f"  {pair}: {n}")

    if rate < args.gate:
        raise SystemExit(
            f"\nFAIL: {rate:.2%} is below {args.gate:.0%}.\n"
            "segments.py and segments.js have drifted apart — reconcile them\n"
            "before training, or the model learns glyphs the wall never draws."
        )
    print(f"\nPASS: renderers agree ({rate:.2%})")


if __name__ == "__main__":
    main()
