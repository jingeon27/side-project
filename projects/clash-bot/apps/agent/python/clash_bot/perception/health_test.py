import unittest

import numpy as np

from clash_bot.perception.health import health_bar


class HealthBarTest(unittest.TestCase):
    def image(self, side, filled):
        image = np.full((40, 70, 3), 210, dtype=np.uint8)
        image[10:15, 20:40] = [35, 55, 85]
        image[11:14, 21:39] = [50, 68, 105]
        image[11:14, 21 : 21 + filled] = [240, 70, 110] if side == "red" else [90, 210, 250]
        return image

    def test_reading_bounds_include_pixel_quantization(self):
        for side in ["red", "blue"]:
            result = health_bar(self.image(side, 5), {"x": 15, "y": 8, "width": 10}, side)
            self.assertIsNotNone(result)
            self.assertLessEqual(result["minFraction"], 5 / 18)
            self.assertGreaterEqual(result["maxFraction"], 5 / 18)
            self.assertLess(result["maxFraction"], 0.5)

    def test_missing_or_occluded_bar_is_unknown(self):
        self.assertIsNone(
            health_bar(
                np.full((40, 70, 3), 200, dtype=np.uint8), {"x": 15, "y": 8, "width": 10}, "red"
            )
        )
        self.assertIsNone(health_bar(self.image("blue", 5), {"x": 15, "y": 8, "width": 25}, "blue"))
