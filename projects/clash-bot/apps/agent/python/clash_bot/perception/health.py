"""Read a bounded HP fraction from an unoccluded unit bar, never full HP by default."""

import numpy as np


def health_bar(pixels, marker, side):
    if not 6 <= marker["width"] <= 13:
        return None
    edge = round(marker["x"] + marker["width"] / 2)
    readings = []
    for top in range(round(marker["y"]) - 1, round(marker["y"]) + 6):
        for left in range(edge - 2, edge + 2):
            for width in range(19, 33):
                if (
                    top < 0
                    or left < 0
                    or top + 6 >= pixels.shape[0]
                    or left + width + 1 >= pixels.shape[1]
                ):
                    continue
                box = pixels[top : top + 5, left : left + width].astype(float)
                dark = box.max(axis=2) < 155
                # Both horizontal outlines and the right cap must be visible.
                if min(dark[0].mean(), dark[-1].mean(), dark[:, -1].mean()) < 0.85:
                    continue
                outside = pixels[top + 1 : top + 4, left + width].max(axis=1)
                if np.mean(outside > 160) < 0.66:
                    continue
                inside = box[1:4, 1:-1]
                red, green, blue = (inside[:, :, index] for index in range(3))
                filled = (
                    (red > 145) & (red > green * 1.35) & (red > blue * 1.2)
                    if side == "red"
                    else (blue > 155) & (blue > red * 1.3) & (green > red * 1.15)
                )
                columns = filled.sum(axis=0) >= 2
                if not columns[0] or np.any(np.diff(columns.astype(int)) > 0):
                    continue
                count = int(columns.sum())
                # Pixel quantization, anti-aliasing and the badge overlap each
                # widen the interval. The reading says nothing about card level.
                readings.append(((count - 1) / len(columns), (count + 1) / len(columns)))
    if not readings:
        return None
    low, high = max(0, min(row[0] for row in readings)), min(1, max(row[1] for row in readings))
    if high - low > 0.3:
        return None
    return {"minFraction": round(low, 3), "maxFraction": round(high, 3), "source": "visible_hp_bar"}
