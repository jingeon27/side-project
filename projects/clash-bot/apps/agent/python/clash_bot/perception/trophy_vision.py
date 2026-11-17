"""Read-only real-client proposals and crop identities, with unknown sides preserved."""

import hashlib
import json
import math
import sys
import time
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from clash_bot.channel import protocol_channel


class ScanInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)
    op: Literal["scan"]
    image: str = Field(min_length=1)


class AbsenceInput(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)
    op: Literal["absence"]
    image: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    box: tuple[float, float, float, float]


INPUT = TypeAdapter(Annotated[ScanInput | AbsenceInput, Field(discriminator="op")])


BACKGROUND = {"drop", "dirt", "axe", "tower", "king-tower", "princess-tower", "graveyard", "poison"}


def identity(label):
    return label.removesuffix("-evolution").removesuffix("-hero").replace("-", "_")


def side_from_pixels(pixels, box):
    """A side cue must dominate; body position never decides allegiance."""
    import numpy as np

    left, top, right, _ = box
    x = (left + right) / 2
    region = pixels[
        max(0, math.floor(top) - 18) : min(515, math.ceil(top) + 9),
        max(0, math.floor(x) - 23) : min(368, math.ceil(x) + 23),
    ].astype(float)
    if region.size == 0:
        return "unknown", {"red": 0, "blue": 0}
    r, g, b = (region[:, :, channel] for channel in range(3))
    red = (r > 85) & (r > g * 1.65) & (r > b * 1.2) & (b > 15) & (b < 165)
    blue = (b > 120) & (b > r * 1.5) & (g > r * 1.2)
    scores = {"red": int(np.count_nonzero(red)), "blue": int(np.count_nonzero(blue))}
    strongest = max(scores, key=scores.get)
    weakest = "blue" if strongest == "red" else "red"
    if scores[strongest] < 18 or scores[strongest] < scores[weakest] * 1.8:
        return "unknown", scores
    return strongest, scores


def suppress_duplicates(rows):
    selected = []
    for row in sorted(rows, key=lambda row: -row["confidence"]):
        if any(
            other["kind"] == row["kind"]
            and other["side"] == row["side"]
            and math.hypot(other["x"] - row["x"], other["y"] - row["y"]) < 9
            for other in selected
        ):
            continue
        selected.append(row)
    return selected


class TrophyVision:
    def __init__(self, directory, references):
        import numpy as np
        from PIL import Image

        from clash_bot.perception.vision_worker import VisionWorker

        self.worker = VisionWorker(directory, threads=1)
        references = Path(references).resolve()
        proof = json.loads((references / "clock-reference.json").read_text())
        if proof.get("format") != "reviewed-hostile-deployment-clock-v1":
            raise ValueError("Unknown deployment-clock reference")
        path = (references / proof["image"]).resolve()
        if (
            not path.is_relative_to(references)
            or hashlib.sha256(path.read_bytes()).hexdigest() != proof["sha256"]
        ):
            raise ValueError("Deployment-clock reference changed or escaped its directory")
        self.clock = np.asarray(Image.open(path).convert("RGB"))

    def absence(self, request):
        from PIL import Image

        image = Image.open(request["image"]).convert("RGB")
        if image.size != (368, 652):
            raise ValueError("Expected normalized screenshot")
        left, top, right, bottom = request["box"]
        boxes = [
            [max(0, left + dx), max(0, top + dy), min(368, right + dx), min(652, bottom + dy)]
            for dx in (-28, 0, 28)
            for dy in (-28, 0, 28)
        ]
        rows = self.worker.classify(image, boxes, include_labels=True)
        scores = [
            sum(
                value
                for label, value in row["label_scores"].items()
                if identity(label) == request["kind"]
            )
            for row in rows
        ]
        maximum = max(scores, default=1)
        return {
            "kind": request["kind"],
            "absent": maximum < 0.12,
            "maxProbability": maximum,
            "spatialEnvelopePx": 28,
        }

    def scan(self, request):
        import numpy as np
        from PIL import Image

        image = Image.open(request["image"]).convert("RGB")
        if image.size != (368, 652):
            raise ValueError("Expected normalized 368x652 real-client screenshot")
        pixels = np.asarray(image)
        boxes = self.worker.proposals(image)
        classifications = self.worker.classify(image, boxes)
        units = []
        for box, result in zip(boxes, classifications):
            label = result["label"]
            base = identity(label)
            score = result["raw_confidence"]
            if label in BACKGROUND or score < 0.65 or not 70 < box[3] < 505:
                continue
            side, evidence = side_from_pixels(pixels, box)
            units.append(
                {
                    "kind": base,
                    "label": label,
                    "confidence": score,
                    "variant": "unknown"
                    if score < 0.85
                    else "evolution"
                    if label.endswith("-evolution")
                    else "hero"
                    if label.endswith("-hero")
                    else "base",
                    "side": side,
                    "sideEvidence": evidence,
                    "box": box,
                    "x": (box[0] + box[2]) / 2,
                    "y": box[3] - 4,
                }
            )
        effect_boxes = [
            [max(0, x - 60), y - 60, min(368, x + 60), y + 60]
            for x in (56, 85, 283, 310)
            for y in (146, 406)
        ]
        effects = []
        for box, result in zip(effect_boxes, self.worker.classify(image, effect_boxes)):
            region = pixels[round(box[1]) : round(box[3]), round(box[0]) : round(box[2])].astype(
                float
            )
            r, g, b = (region[:, :, c] for c in range(3))
            purple = int(np.count_nonzero((r > 100) & (b > 130) & (r > g * 1.25) & (b > g * 1.3)))
            for card, threshold in (("graveyard", 0.25), ("poison", 0.6)):
                probability = result["card_scores"][card]
                if purple < 180 or probability < threshold:
                    continue
                effects.append(
                    {
                        "card": card,
                        "x": (box[0] + box[2]) / 2,
                        "y": (box[1] + box[3]) / 2,
                        "radius": 60,
                        "confidence": probability,
                        "purplePixels": purple,
                        "box": box,
                    }
                )
        return {
            "format": "trophy-visual-facts-v1",
            "units": suppress_duplicates(units),
            "effectCandidates": effects,
            "emergences": clock_matches(pixels, self.clock),
        }


def clock_matches(pixels, template):
    import cv2
    import numpy as np

    r, g, b = (template[:, :, c].astype(float) for c in range(3))
    mask = (
        ((r > 170) & (g > 100) & (b < 160) & (r > b * 1.2))
        | ((r > 170) & (b > 140) & (g < r * 0.7))
    ).astype(np.uint8) * 255
    scores = cv2.matchTemplate(pixels[300:495], template, cv2.TM_SQDIFF_NORMED, mask=mask)
    height, width = template.shape[:2]
    rows, columns = np.where(np.isfinite(scores) & (scores < 0.015))
    result = []
    for y, x in sorted(zip(rows, columns), key=lambda point: float(scores[point[0], point[1]])):
        point = {
            "x": float(x + width / 2),
            "y": float(y + 300 + height / 2),
            "score": 1 - float(scores[y, x]),
            "evidence": "reviewed_hostile_deployment_clock",
        }
        if not any(math.hypot(point["x"] - p["x"], point["y"] - p["y"]) < 25 for p in result):
            result.append(point)
    return result[:4]


def main():
    if len(sys.argv) != 3:
        raise ValueError("Provide detector and reviewed real-client reference directories")
    directory = Path(sys.argv[1]).resolve()
    emit = protocol_channel()
    worker = TrophyVision(directory, sys.argv[2])
    emit({"type": "ready", "format": "trophy-visual-facts-v1", "readOnly": True})
    for line in sys.stdin:
        started = time.monotonic()
        try:
            request = INPUT.validate_json(line)
            result = (
                worker.scan(request.model_dump())
                if request.op == "scan"
                else worker.absence(request.model_dump())
            )
            emit(
                {
                    "type": "result",
                    **result,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                }
            )
        except (ValueError, OSError) as error:
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
