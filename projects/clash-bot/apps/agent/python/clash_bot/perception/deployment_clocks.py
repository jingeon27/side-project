"""Hostile deployment clocks across changing face/hand animation, not card identities."""

import math


def animated_clocks(pixels):
    import cv2
    import numpy as np

    region = pixels[300:495].astype(float)
    r, g, b = (region[:, :, c] for c in range(3))
    yellow = (r > 170) & (g > 100) & (b < 170) & (r > b * 1.3)
    hostile = (r > 135) & (r > g * 1.6) & (r > b * 1.15)
    friendly = (b > 125) & (b > r * 1.35) & (g > r * 1.1)
    rim = cv2.morphologyEx(
        yellow.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)
    )
    contours, hierarchy = cv2.findContours(rim, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return []
    result = []
    for index, contour in enumerate(contours):
        x, y, width, height = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if hierarchy[0][index][3] < 0 or not (
            70 < area < 500 and 15 < width < 30 and 15 < height < 30 and 0.8 < width / height < 1.25
        ):
            continue
        if x < 15 or x + width > 353:
            continue
        if not 0.5 < area / (width * height) < 0.82:
            continue
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0 or 4 * math.pi * area / perimeter**2 < 0.6:
            continue
        inside = np.zeros_like(rim)
        cv2.drawContours(inside, contours, index, 1, -1)
        selected = inside > 0
        # The round face must have a yellow border. Size, roundness and extent
        # above reject clothing, hair, explosions and the larger rolling Barrel.
        ring = (cv2.dilate(inside, np.ones((5, 5), np.uint8)) > 0) & ~selected
        if yellow[ring].mean() <= 0.2:
            continue
        red = int(hostile[selected].sum())
        blue = int(friendly[selected].sum())
        share = red / int(selected.sum())
        if share < 0.4 or blue > red / 2:
            continue
        result.append(
            {
                "x": float(x + width / 2),
                "y": float(y + 300 + height / 2),
                "score": min(0.95, 0.65 + share * 0.3),
                "evidence": "reviewed_hostile_deployment_clock",
                "method": "closed_yellow_rim_hostile_face",
            }
        )
    return result


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
    proposed = [
        {
            "x": float(x + width / 2),
            "y": float(y + 300 + height / 2),
            "score": 1 - float(scores[y, x]),
            "evidence": "reviewed_hostile_deployment_clock",
            "method": "exact_reviewed_reference",
        }
        for y, x in zip(rows, columns)
    ]
    proposed.extend(animated_clocks(pixels))
    result = []
    for point in sorted(proposed, key=lambda row: -row["score"]):
        if not any(
            math.hypot(point["x"] - other["x"], point["y"] - other["y"]) < 25 for other in result
        ):
            result.append(point)
    return result[:4]
