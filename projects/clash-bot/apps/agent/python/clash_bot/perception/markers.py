"""Level-badge and HP-bar markers, and the classified unit bodies below them."""

import cv2
import numpy as np

from clash_bot.perception.health import health_bar


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


class UnitMarkers:
    """Mixed into VisionWorker for its `classify`."""

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
