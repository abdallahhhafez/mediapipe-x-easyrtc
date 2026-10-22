"""
Train the digit classifier and export it as a MediaPipe .task bundle.

    python train.py --data dataset --out ../../client/public/mediapipe

Uses MediaPipe Model Maker, which exports exactly the bundle that
`ImageClassifier.createFromOptions({ modelAssetPath: 'digits.task' })` consumes
in digitReader.worker.js — no conversion step in between.

The task is easy by construction (eleven classes of high-contrast glyphs we draw
ourselves), so this is a short fine-tune, not a research run. What matters is
the confusion matrix at the end: the reader's confidence gate is set at 0.9, and
the gate only protects against uncertainty the model actually expresses. A model
that is confidently wrong about 6 vs 8 would put a wrong number in front of a
nurse, so that pair is checked explicitly.
"""

import argparse
from pathlib import Path

GATE = 0.995  # required top-1 accuracy on the held-out split


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("dataset"))
    ap.add_argument("--out", type=Path, default=Path("../../client/public/mediapipe"))
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=64)
    args = ap.parse_args()

    from mediapipe_model_maker import image_classifier

    data = image_classifier.Dataset.from_folder(str(args.data))
    train_data, rest = data.split(0.8)
    validation_data, test_data = rest.split(0.5)
    print(f"train={train_data.size} val={validation_data.size} test={test_data.size}")

    # MobileNetV2 is far more model than eleven seven-segment glyphs need, but
    # it is what Model Maker ships with and it still lands under a megabyte.
    spec = image_classifier.SupportedModels.MOBILENET_V2
    hparams = image_classifier.HParams(
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=0.004,
        export_dir=str(args.out),
    )
    options = image_classifier.ImageClassifierOptions(supported_model=spec, hparams=hparams)

    model = image_classifier.ImageClassifier.create(
        train_data=train_data,
        validation_data=validation_data,
        options=options,
    )

    loss, accuracy = model.evaluate(test_data)
    print(f"\nheld-out loss={loss:.4f} accuracy={accuracy:.4f}")

    args.out.mkdir(parents=True, exist_ok=True)
    model.export_model("digits.task")
    print(f"exported {args.out / 'digits.task'}")

    if accuracy < GATE:
        raise SystemExit(
            f"\nFAIL: {accuracy:.4f} is below the {GATE} gate.\n"
            "The reader falls back to the seven-segment decoder rather than\n"
            "shipping a model that guesses. Generate more data or train longer."
        )
    print(f"\nPASS: {accuracy:.4f} >= {GATE}")


if __name__ == "__main__":
    main()
