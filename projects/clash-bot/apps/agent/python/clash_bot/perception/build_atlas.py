"""Bootstrap Counterpush-specific poses from visually checked local screenshots."""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


def main(directory):
    directory = Path(directory)
    records = json.loads((directory / "atlas-annotations.json").read_text())
    manifest = json.loads((directory / "crop-export.json").read_text())
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    model = ort.InferenceSession(
        str(directory / "crop-classifier.onnx"), options, providers=["CPUExecutionProvider"]
    )
    cards, crops, sources = [], [], []
    for record in records:
        source = directory / (record["image"] + ".png")
        image = Image.open(source).convert("RGB")
        sources.append(
            {
                "image": source.name,
                "sha256": hashlib.file_digest(source.open("rb"), "sha256").hexdigest(),
                "card": record["card"],
                "box": record["box"],
            }
        )
        for dx, dy in ((0, 0), (-2, 0), (2, 0), (0, -2), (0, 2)):
            left, top, right, bottom = record["box"]
            crop = image.crop((left + dx, top + dy, right + dx, bottom + dy)).resize((112, 112))
            pixels = np.asarray(crop, dtype=np.float32) / 255
            crops.append(
                ((pixels - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)
            )
            cards.append(record["card"])
    _, features = model.run(None, {"images": np.asarray(crops, dtype=np.float32)})
    features /= np.linalg.norm(features, axis=1, keepdims=True) + 1e-8
    np.savez(directory / "atlas.npz", features=features)
    (directory / "atlas.json").write_text(
        json.dumps(
            {
                "model_sha256": manifest["onnx_sha256"],
                "cards": cards,
                "sources": sources,
                "annotation": "visually_checked_bootstrap_sprites",
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"sprites": len(records), "feature_references": len(cards)}))


if __name__ == "__main__":
    main(sys.argv[1])
