"""CPU-only Counterpush unit crops. Screenshots in, public visual facts out."""

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from clash_bot.perception.health import health_bar
from clash_bot.perception.protocol import protocol_channel, serve

cv2.setNumThreads(1)


def canonical(label):
    name = label.removesuffix("-evolution").removesuffix("-hero")
    return {
        "furnace": "furnace",
        "ice-wizard": "ice_wizard",
        "knight": "knight",
        "goblin-hut": "goblin_hut",
        "skeleton": "skeletons",
        "barbarian": "barbarian_barrel",
        "barbarian-barrel": "barbarian_barrel",
        "graveyard": "graveyard",
        "poison": "poison",
    }.get(name)


def unit_kind(label):
    name = label.removesuffix("-evolution").removesuffix("-hero")
    return {
        "furnace": "furnace",
        "ice-wizard": "ice_wizard",
        "knight": "knight",
        "goblin-hut": "goblin_hut",
        "skeleton": "skeleton",
        "barbarian": "barbarian",
        "fire-spirit": "fire_spirit",
        "spear-goblin": "spear_goblin",
        "barbarian-barrel": "barrel",
    }.get(name)


def poison_rings(pixels):
    """Find the opponent's orange/red outline, excluding global crown flashes.

    This is specific to the verified fixed eight-card Counterpush deck. A ring
    alone is never a teaching label; the crop classifier must also see Poison.
    """
    red, green, blue = [pixels[:, :, index].astype(float) for index in range(3)]
    mask = (
        (red > 180)
        & (green > 65)
        & (green < 175)
        & (blue < 130)
        & (red > green * 1.4)
        & (red > blue * 1.9)
    ).astype(np.uint8) * 255
    mask[:40] = 0
    mask[515:] = 0
    if np.count_nonzero(mask[40:515]) / (475 * 368) > 0.08:
        return []
    circles = cv2.HoughCircles(
        mask, cv2.HOUGH_GRADIENT, 1, 55, param1=70, param2=14, minRadius=45, maxRadius=75
    )
    if circles is None:
        return []
    result = []
    for x, y, radius in circles[0]:
        if not 30 < x < 338 or not 80 < y < 465 or not 45 <= radius <= 70:
            continue
        angles = np.arange(0, 2 * np.pi, 2 * np.pi / 96)
        coverage = sum(
            any(
                0 <= int(y + (radius + delta) * np.sin(angle)) < 652
                and 0 <= int(x + (radius + delta) * np.cos(angle)) < 368
                and mask[
                    int(y + (radius + delta) * np.sin(angle)),
                    int(x + (radius + delta) * np.cos(angle)),
                ]
                > 0
                for delta in range(-4, 5)
            )
            for angle in angles
        ) / len(angles)
        if coverage >= 0.45:
            result.append(
                {"x": float(x), "y": float(y), "radius": float(radius), "coverage": coverage}
            )
    return result


def graveyard_presence(pixels, x):
    # Tombstones can appear midway through an existing cast. Absence of one
    # particular stone is insufficient: conservatively reject an already-purple
    # lane, including ambiguous large purple effects, as a new demonstration.
    left, right = (18, 184) if x < 184 else (184, 350)
    region = pixels[300:490, left:right]
    red, green, blue = [region[:, :, index].astype(float) for index in range(3)]
    purple = (
        (red > 90)
        & (blue > 135)
        & (red > green * 1.35)
        & (blue > green * 1.45)
        & (blue > red * 0.85)
    )
    return int(np.count_nonzero(purple))


def input_guard(request):
    pixels = np.asarray(Image.open(request["image"]).convert("RGB"))
    if pixels.shape != (652, 368, 3):
        raise ValueError("Expected a normalized game screenshot")
    return {"graveyardPresence": [graveyard_presence(pixels, 95), graveyard_presence(pixels, 273)]}


def red_markers(image, badges=None, side="red"):
    if badges:
        candidates = []
        for badge in badges:
            height, width = badge.shape[:2]
            scores = (
                cv2.matchTemplate(image, badge, cv2.TM_CCOEFF_NORMED)
                if side == "red"
                else cv2.matchTemplate(
                    cv2.cvtColor(image, cv2.COLOR_RGB2GRAY),
                    cv2.cvtColor(badge, cv2.COLOR_RGB2GRAY),
                    cv2.TM_CCOEFF_NORMED,
                )
            )
            rows, columns = np.where(scores >= 0.80)
            for y, x in zip(rows, columns):
                if not 18 <= x <= 350 - width or not 40 <= y <= 510 - height:
                    continue
                if x > 306 and y > 454:
                    continue
                patch = image[y : y + height, x : x + width]
                means = patch.mean(axis=(0, 1))
                valid = (
                    (
                        means[0] >= means[1] * 1.25
                        and means[0] >= means[2] * 1.1
                        and np.mean(np.abs(patch.astype(float) - badge.astype(float))) <= 38
                    )
                    if side == "red"
                    else (means[2] >= means[0] * 1.2 and means[1] >= means[0] * 1.1)
                )
                if not valid:
                    continue
                candidates.append(
                    (
                        float(scores[y, x]),
                        {
                            "x": float(x + width / 2),
                            "y": float(y),
                            "bottom": float(y + height),
                            "width": width,
                        },
                    )
                )
        if side in ("red", "blue"):
            # Anti-aliasing and the sprite behind the tiny level badge can lower
            # template correlation below .80. Add geometrically valid red
            # badges with a white level glyph; identity still needs the crop
            # classifier and temporal/absence checks below.
            for point in red_markers(image, side=side):
                height = point["bottom"] - point["y"]
                if not 6 <= point["width"] <= 13 or not 7 <= height <= 14:
                    continue
                left, top = int(point["x"] - point["width"] / 2), int(point["y"])
                patch = image[top : int(point["bottom"]), left : left + int(point["width"])]
                white = (patch.min(axis=2) > 165) & (
                    patch.max(axis=2).astype(float) - patch.min(axis=2) < 65
                )
                if np.count_nonzero(white) >= 6:
                    candidates.append((0.79, point))
        markers = []
        for _, point in sorted(candidates, key=lambda item: item[0], reverse=True):
            if not any(
                abs(point["x"] - marker["x"]) < 10 and abs(point["y"] - marker["y"]) < 12
                for marker in markers
            ):
                markers.append(point)
        return markers
    red, green, blue = (
        image[:, :, 0].astype(float),
        image[:, :, 1].astype(float),
        image[:, :, 2].astype(float),
    )
    mask = (
        (
            (red > 110)
            & (green < 125)
            & (red > green * 1.55)
            & (blue > 30)
            & (blue > green * 1.2)
            & (red > blue * 1.15)
        )
        if side == "red"
        else (
            (blue > 140)
            & (green > 80)
            & (red < 160)
            & (blue > red * 1.25)
            & (green > red * 1.1)
            & (blue > green * 0.95)
        )
    ).astype(np.uint8)
    mask[:40] = 0
    mask[515:] = 0
    mask[:, :18] = 0
    mask[:, 350:] = 0
    mask[454:, 306:] = 0
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((2, 3), np.uint8))
    count, _, components, _ = cv2.connectedComponentsWithStats(mask)
    markers = []
    for index in range(1, count):
        x, y, width, height, area = map(int, components[index])
        if 6 <= width <= 31 and 2 <= height <= 17 and 12 <= area <= 350:
            point = {"x": x + width / 2, "y": y, "bottom": y + height, "width": width}
            if not any(
                abs(point["x"] - item["x"]) < 11 and abs(point["y"] - item["y"]) < 15
                for item in markers
            ):
                markers.append(point)
    return markers


class VisionWorker:
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

    def graveyard_markers(self, pixels):
        if self.grave_marker is None:
            return []
        template = self.grave_marker
        low, high = template.min(axis=2), template.max(axis=2)
        mask = (((high.astype(float) - low) < 32) & (low > 25) & (high < 185)).astype(
            np.uint8
        ) * 255
        if np.count_nonzero(mask) < 12:
            return []
        scores = cv2.matchTemplate(pixels, template, cv2.TM_SQDIFF_NORMED, mask=mask)
        height, width = template.shape[:2]
        rows, columns = np.where(np.isfinite(scores) & (scores < 0.025))
        selected = []
        for y, x in sorted(zip(rows, columns), key=lambda point: float(scores[point[0], point[1]])):
            if not 15 < x < 345 or not 300 < y < 490:
                continue
            if graveyard_presence(pixels, x) < 350:
                continue
            if any(
                abs(x - item["box"][0]) < 20 and abs(y - item["box"][1]) < 20 for item in selected
            ):
                continue
            selected.append(
                {
                    "card": "graveyard",
                    "label": "graveyard_effect_marker",
                    "confidence": min(1.0, 1 - float(scores[y, x])),
                    "x": float(x + width / 2),
                    "y": float(y + height / 2),
                    "marker_y": float(y),
                    "box": [float(x), float(y), float(x + width), float(y + height)],
                    "side": "red",
                }
            )
        return selected

    def poison_markers(self, image):
        rings = poison_rings(np.asarray(image))
        boxes = [
            [
                ring["x"] - ring["radius"],
                ring["y"] - ring["radius"],
                ring["x"] + ring["radius"],
                ring["y"] + ring["radius"],
            ]
            for ring in rings
        ]
        classifications = self.classify(image, boxes)
        return [
            {
                "card": "poison",
                "label": "poison_red_ring_and_crop",
                # A combined visual score, not a calibrated probability.
                "confidence": 0.93 + 0.04 * ring["coverage"],
                "x": ring["x"],
                "y": ring["y"],
                "marker_y": ring["y"],
                "box": box,
                "side": "red",
            }
            for ring, box, classification in zip(rings, boxes, classifications)
            if classification["card_scores"]["poison"] >= 0.65
        ]

    def graveyard_areas(self, image):
        pixels = np.asarray(image)
        region = pixels[300:490, 18:350]
        red, green, blue = [region[:, :, index].astype(float) for index in range(3)]
        mask = (
            (red > 90)
            & (blue > 135)
            & (red > green * 1.35)
            & (blue > green * 1.45)
            & (blue > red * 0.85)
        ).astype(np.uint8)
        joined = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8))
        count, _, components, _ = cv2.connectedComponentsWithStats(joined)
        boxes = []
        for index in range(1, count):
            x, y, width, height, area = map(int, components[index])
            if (
                55 <= width <= 175
                and 50 <= height <= 175
                and area >= 350
                and np.count_nonzero(mask[y : y + height, x : x + width]) >= 350
            ):
                boxes.append([x + 13, y + 295, x + width + 23, y + height + 305])
        classifications = self.classify(image, boxes)
        return [
            {
                "card": "graveyard",
                "label": "graveyard_purple_area_and_crop",
                "confidence": 0.93 + 0.05 * result["card_scores"]["graveyard"],
                "x": (box[0] + box[2]) / 2,
                "y": (box[1] + box[3]) / 2,
                "marker_y": (box[1] + box[3]) / 2,
                "box": box,
                "side": "red",
            }
            for box, result in zip(boxes, classifications)
            if result["card"] == "graveyard" and result["card_scores"]["graveyard"] >= 0.3
        ]

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

    def classify(self, image, boxes, include_labels=False):
        crops = []
        for left, top, right, bottom in boxes:
            crop = image.crop(
                (max(0, int(left)), max(0, int(top)), min(368, int(right)), min(652, int(bottom)))
            )
            pixels = np.asarray(crop.resize((112, 112)), dtype=np.float32) / 255
            crops.append(
                ((pixels - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)
            )
        if not crops:
            return []
        logits, features = self.classifier.run(
            None, {"images": np.asarray(crops, dtype=np.float32)}
        )
        probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
        probabilities /= probabilities.sum(axis=1, keepdims=True)
        results = []
        for row, feature in zip(probabilities, features):
            card = canonical(self.classes[int(row.argmax())])
            kind = unit_kind(self.classes[int(row.argmax())])
            # Normal, evolution and hero variants may split probability mass.
            confidence = sum(
                float(value)
                for label, value in zip(self.classes, row)
                if card is not None and canonical(label) == card
            )
            if card is None and kind is not None:
                confidence = sum(
                    float(value)
                    for label, value in zip(self.classes, row)
                    if unit_kind(label) == kind
                )
            label = self.classes[int(row.argmax())]
            variant = (
                (
                    "evolution"
                    if label.endswith("-evolution")
                    else "hero"
                    if label.endswith("-hero")
                    else "base"
                )
                if row.max() >= 0.8
                else "unknown"
            )
            result = {
                "label": self.classes[int(row.argmax())],
                "confidence": confidence,
                "card": card,
                "kind": kind,
                "variant": variant,
                "raw_confidence": float(row.max()),
                "recognition": "pretrained_crop",
            }
            result["card_scores"] = {
                name: sum(
                    float(value)
                    for label, value in zip(self.classes, row)
                    if canonical(label) == name
                )
                for name in (
                    "furnace",
                    "ice_wizard",
                    "knight",
                    "goblin_hut",
                    "skeletons",
                    "barbarian_barrel",
                    "graveyard",
                    "poison",
                )
            }
            if include_labels:
                result["label_scores"] = {
                    label: float(value) for label, value in zip(self.classes, row)
                }
            if self.atlas_features is not None:
                scores = self.atlas_features @ (feature / (np.linalg.norm(feature) + 1e-8))
                grouped = {
                    name: max(
                        float(score)
                        for score, entry in zip(scores, self.atlas["cards"])
                        if entry == name
                    )
                    for name in set(self.atlas["cards"])
                }
                ranked = sorted(grouped.items(), key=lambda item: item[1], reverse=True)
                name, similarity = ranked[0]
                margin = similarity - ranked[1][1]
                result["atlas_scores"] = grouped
                if (
                    similarity >= 0.92
                    and margin >= 0.04
                    and name != "background"
                    and (confidence < 0.9 or card == name)
                ):
                    result.update(
                        {
                            "card": name,
                            "label": f"atlas:{name}",
                            "confidence": min(1.0, max(0.0, similarity)),
                            "kind": {"skeletons": "skeleton", "barbarian_barrel": "barbarian"}.get(
                                name, name
                            ),
                            "variant": "unknown",
                            "recognition": "counterpush_atlas",
                            "atlas_margin": margin,
                        }
                    )
            results.append(result)
        return results

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

    def scan_markers(self, image, markers, proposals, side):
        boxes, associations = [], []
        for index, marker in enumerate(markers):
            x, y = marker["x"], marker["bottom"]
            for width, height, shift in ((28, 40, 0), (36, 48, -2), (46, 60, -4)):
                boxes.append([x - width / 2, y + shift, x + width / 2, y + shift + height])
                associations.append(index)
            for offset in (8, 16):
                boxes.append([x + offset - 23, y - 4, x + offset + 23, y + 56])
                associations.append(index)
            for proposal in proposals:
                if (
                    abs((proposal[0] + proposal[2]) / 2 - x) < 23
                    and -15 < proposal[1] - marker["y"] < 25
                ):
                    boxes.append(proposal)
                    associations.append(index)
        classifications = self.classify(image, boxes)
        entities = []
        for index, marker in enumerate(markers):
            candidates = [
                (classification, box)
                for classification, box, association in zip(classifications, boxes, associations)
                if association == index
            ]
            if not candidates:
                continue
            result, box = max(candidates, key=lambda item: item[0]["confidence"])
            if (result["card"] or result["kind"]) and result["confidence"] >= 0.65:
                health = health_bar(np.asarray(image), marker, side)
                entities.append(
                    {
                        **result,
                        "x": (box[0] + box[2]) / 2,
                        "y": (box[1] + box[3]) / 2,
                        "marker_x": marker["x"],
                        "marker_y": marker["y"],
                        "box": box,
                        "side": side,
                        **({"health": health} if health is not None else {}),
                    }
                )
        # A badge and its health-bar marker can select the very same proposal.
        # Count that body once; nearby skeletons with distinct boxes stay separate.
        unique = {}
        for entity in entities:
            key = (entity["side"], entity["kind"], *entity["box"])
            if key not in unique or entity["confidence"] > unique[key]["confidence"]:
                unique[key] = entity
        return list(unique.values())

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
