# The digit classifier

MediaPipe Tasks Vision has no OCR task, so the reader's MediaPipe engine runs a
model we train here: an `ImageClassifier` over eleven classes — `0`–`9` and
`blank`.

`blank` is a real class, not a fallback. A two-digit value in a three-digit
field leaves its leading cell empty, exactly as a bedside monitor does, and the
reader has to be able to say so.

## Why there is no font

The digits are seven-segment glyphs drawn from geometry, defined once in
[`segments.py`](segments.py) and mirrored in
[`../../client/src/vision/segments.js`](../../client/src/vision/segments.js).
Sharing a formula rather than a TTF means the browser's rasteriser and Pillow
cannot disagree about what a `7` looks like, and there is nothing to ship or
license. **Change one of those two files and you must change the other and
retrain.**

## Running it

```bash
pip install -r requirements.txt
python generate_dataset.py --per-class 2000
python train.py
```

`train.py` writes `digits.task` into `client/public/mediapipe/`, which is where
the worker looks for it. It fails loudly if held-out accuracy is below 99.5%.

## Not having run it

Everything works without a model. `digitReader.worker.js` probes for
`digits.task` on startup and, when it is absent, uses the seven-segment decoder
in [`segmentReader.js`](../../client/src/vision/segmentReader.js) — a real
pixel-sampling recogniser that thresholds each crop and reads which segments are
lit. It scores 100% against live telemetry on our own rendering, so a fresh
clone runs end to end with no Python toolchain at all.

Which engine is live is shown in the nurse's *What MediaPipe reads* panel, next
to a rolling accuracy figure scored against the telemetry.

The trained model earns its place on the input the decoder cannot handle: a
camera pointed at a *physical* monitor, where glare, angle and focus break the
fixed-threshold assumption. The decoder then becomes the ground truth you
validate that model against.
