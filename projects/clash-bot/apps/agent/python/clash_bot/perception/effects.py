"""Opponent Poison and Graveyard effects from red outlines, purple areas and tombstones."""

import cv2
import numpy as np


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


class SpellEffects:
    """Mixed into VisionWorker for its `grave_marker` reference and `classify`."""

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
