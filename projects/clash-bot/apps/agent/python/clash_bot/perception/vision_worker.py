"""CPU-only Counterpush unit crops. Screenshots in, public visual facts out."""

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from clash_bot.perception.classifier import CropClassifier
from clash_bot.perception.effects import SpellEffects, graveyard_presence
from clash_bot.perception.markers import UnitMarkers, red_markers
from clash_bot.perception.protocol import protocol_channel, serve

cv2.setNumThreads(1)


def input_guard(request):
    pixels = np.asarray(Image.open(request["image"]).convert("RGB"))
    if pixels.shape != (652, 368, 3):
        raise ValueError("Expected a normalized game screenshot")
    return {"graveyardPresence": [graveyard_presence(pixels, 95), graveyard_presence(pixels, 273)]}


class VisionWorker(CropClassifier, SpellEffects, UnitMarkers):
    def __init__(self, directory, threads=1):
        self.directory = Path(directory)
        manifest = json.loads((self.directory / "crop-export.json").read_text())
        model = self.directory / "crop-classifier.onnx"
        with model.open("rb") as handle:
            actual_sha = hashlib.file_digest(handle, "sha256").hexdigest()
        if actual_sha != manifest["onnx_sha256"]:
            raise ValueError("Crop classifier ONNX checksum mismatch")
        options = ort.SessionOptions()
        if threads not in (1, 2, 3, 4):
            raise ValueError("Use 1..4 bounded perception threads")
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self.classifier = ort.InferenceSession(
            str(model), options, providers=["CPUExecutionProvider"]
        )
        self.classes = json.loads((self.directory / "crop-classes.json").read_text())
        self.badges = [
            np.asarray(Image.open(path).convert("RGB"))
            for path in sorted(self.directory.glob("red-11*.png"))
        ]
        self.blue_badges = [
            np.asarray(Image.open(path).convert("RGB"))
            for path in sorted(self.directory.glob("blue-11*.png"))
        ]
        stone = self.directory / "graveyard-marker.png"
        self.grave_marker = np.asarray(Image.open(stone).convert("RGB")) if stone.exists() else None

        atlas = self.directory / "atlas.json"
        self.atlas = json.loads(atlas.read_text()) if atlas.exists() else None
        self.atlas_features = None
        if self.atlas:
            if self.atlas["model_sha256"] != manifest["onnx_sha256"]:
                raise ValueError("Counterpush sprite atlas uses a different feature model")
            self.atlas_features = np.load(self.directory / "atlas.npz", allow_pickle=False)[
                "features"
            ]
        # This older detector proposes boxes only. Its card labels are not used;
        # modern evolution/hero identity comes from the crop classifier above.
        detector = self.directory / "units_M_480x352.onnx"
        self.detector = (
            ort.InferenceSession(str(detector), options, providers=["CPUExecutionProvider"])
            if detector.exists()
            else None
        )

    def proposals(self, image):
        if self.detector is None:
            return []
        crop = image.crop((0, int(652 * 0.05), 368, int(652 * 0.8)))
        height, width = self.detector.get_inputs()[0].shape[2:]
        ratio = min(width / crop.width, height / crop.height)
        resized = crop.resize((int(crop.width * ratio), int(crop.height * ratio)))
        px, py = (width - resized.width + 1) // 2, (height - resized.height + 1) // 2
        canvas = Image.new("RGB", (width, height), (114, 114, 114))
        canvas.paste(resized, (px, py))
        pixels = np.asarray(canvas, dtype=np.float16).transpose(2, 0, 1)[None] / 255
        output = self.detector.run(None, {self.detector.get_inputs()[0].name: pixels})[0][0]
        return [
            [
                (float(row[0]) - px) / ratio,
                (float(row[1]) - py) / ratio + int(652 * 0.05),
                (float(row[2]) - px) / ratio,
                (float(row[3]) - py) / ratio + int(652 * 0.05),
            ]
            for row in output
            if row[4] >= 0.25 and row[2] - row[0] > 5
        ]

    def scan(self, request):
        image = Image.open(request["image"]).convert("RGB")
        if image.size != (368, 652):
            raise ValueError("Expected a normalized 368x652 game screenshot")
        pixels = np.asarray(image)
        proposals = self.proposals(image)
        markers = red_markers(pixels, self.badges)
        blue_markers = red_markers(pixels, self.blue_badges or self.badges, "blue")
        graveyards = self.graveyard_areas(image)
        poisons = self.poison_markers(image)
        red_units = self.scan_markers(image, markers, proposals, "red")
        blue_units = self.scan_markers(image, blue_markers, proposals, "blue")
        markers.extend(
            [
                {
                    "x": item["x"],
                    "y": item["marker_y"],
                    "bottom": item["box"][3],
                    "width": item["box"][2] - item["box"][0],
                    "kind": "effect",
                }
                for item in graveyards + poisons
            ]
        )
        effects = [
            {
                "card": item["card"],
                "side": item["side"],
                "x": item["x"],
                "y": item["y"],
                "radius": max(item["box"][2] - item["box"][0], item["box"][3] - item["box"][1]) / 2,
                "confidence": item["confidence"],
            }
            for item in graveyards + poisons
        ]
        children = [
            {**unit, "sourceCard": "furnace" if unit["kind"] == "fire_spirit" else "goblin_hut"}
            for unit in red_units + blue_units
            if unit["card"] is None and unit["kind"] in ("fire_spirit", "spear_goblin")
        ]
        return {
            "entities": [unit for unit in red_units if unit["card"]] + graveyards + poisons,
            "markers": markers,
            "allies": [unit for unit in blue_units if unit["card"]],
            "spawnedUnits": children,
            "effects": effects,
            "graveyardPresence": [graveyard_presence(pixels, 95), graveyard_presence(pixels, 273)],
        }

    def absent(self, request):
        image = Image.open(request["image"]).convert("RGB")
        if request["card"] == "poison":
            left, top, right, bottom = request["box"]
            boxes = [
                [left + dx, top + dy, right + dx, bottom + dy]
                for dx, dy in ((0, 0), (-8, 0), (8, 0), (0, -8), (0, 8))
            ]
            probability = max(item["card_scores"]["poison"] for item in self.classify(image, boxes))
            pixels = np.asarray(image)
            red, green, blue = [pixels[:, :, index].astype(float) for index in range(3)]
            mask = (
                (red > 180)
                & (green > 65)
                & (green < 175)
                & (blue < 130)
                & (red > green * 1.4)
                & (red > blue * 1.9)
            )
            x, y, radius = (left + right) / 2, (top + bottom) / 2, (right - left) / 2
            coverage = (
                sum(
                    any(
                        0 <= int(y + (radius + delta) * np.sin(angle)) < 652
                        and 0 <= int(x + (radius + delta) * np.cos(angle)) < 368
                        and mask[
                            int(y + (radius + delta) * np.sin(angle)),
                            int(x + (radius + delta) * np.cos(angle)),
                        ]
                        for delta in range(-4, 5)
                    )
                    for angle in np.arange(0, 2 * np.pi, 2 * np.pi / 96)
                )
                / 96
            )
            # Presence/ambiguity has a LOWER gate than a new positive label.
            # Missing a Hough circle in an occluded frame is not proof of absence.
            return {
                "absent": probability < 0.3 and coverage < 0.3,
                "max_card_probability": probability,
                "max_atlas_similarity": 0.0,
                "max_effect_coverage": coverage,
            }
        if request["card"] == "graveyard":
            prior = self.graveyard_markers(np.asarray(image))
            x = (request["box"][0] + request["box"][2]) / 2
            present = graveyard_presence(np.asarray(image), x) >= 350 or any(
                abs(item["x"] - x) < 65 for item in prior
            )
            return {
                "absent": not present,
                "max_card_probability": 1.0 if present else 0.0,
                "max_atlas_similarity": 1.0 if present else 0.0,
            }
        left, top, right, bottom = request["box"]
        distance = min(65, max(20, float(request["gap_ms"]) / 1000 * 28))
        boxes = [
            [left + dx, top + dy, right + dx, bottom + dy]
            for dx in (-distance, 0, distance)
            for dy in (-distance, 0, distance)
            if right + dx > 0 and left + dx < 368 and bottom + dy > 0 and top + dy < 652
        ]
        classifications = self.classify(image, boxes)
        probability = max(
            (item["card_scores"].get(request["card"], 0) for item in classifications), default=1
        )
        similarity = max(
            (item.get("atlas_scores", {}).get(request["card"], 0) for item in classifications),
            default=1,
        )
        return {
            "absent": probability < 0.4 and similarity < 0.75,
            "max_card_probability": probability,
            "max_atlas_similarity": similarity,
        }


def main():
    emit = protocol_channel()
    worker = VisionWorker(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1)
    emit({"type": "ready"})
    serve({"scan": worker.scan, "guard": input_guard, "absent": worker.absent}, sys.stdin, emit)


if __name__ == "__main__":
    main()
