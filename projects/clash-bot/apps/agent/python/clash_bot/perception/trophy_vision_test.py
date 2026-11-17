import json
import unittest

import numpy as np
from pydantic import ValidationError

from clash_bot.perception.trophy_vision import (
    INPUT,
    clock_matches,
    side_from_pixels,
    suppress_duplicates,
)


class TrophyVisionTest(unittest.TestCase):
    def test_rejects_training_or_missing_visual_source(self):
        for request in (
            {"op": "train", "image": "a.png"},
            {"op": "scan"},
            {"op": "absence", "image": "a.png", "kind": "goblin_drill"},
        ):
            with self.assertRaises(ValidationError):
                INPUT.validate_json(json.dumps(request))

    def test_location_is_not_allegiance_and_conflicting_color_is_unknown(self):
        pixels = np.zeros((652, 368, 3), dtype=np.uint8)
        box = [30, 350, 60, 410]
        self.assertEqual(side_from_pixels(pixels, box)[0], "unknown")
        pixels[335:350, 35:55] = [180, 30, 60]
        self.assertEqual(side_from_pixels(pixels, box)[0], "red")
        pixels[350:365, 35:55] = [20, 150, 240]
        self.assertEqual(side_from_pixels(pixels, box)[0], "unknown")

    def test_duplicate_proposals_do_not_create_extra_units_or_card_spends(self):
        rows = [
            {"kind": "goblin_drill", "side": "red", "x": 40, "y": 410, "confidence": 0.9},
            {"kind": "goblin_drill", "side": "red", "x": 42, "y": 411, "confidence": 0.8},
            {"kind": "goblin", "side": "red", "x": 43, "y": 414, "confidence": 0.85},
        ]
        self.assertEqual(len(suppress_duplicates(rows)), 2)

    def test_clock_template_does_not_match_flat_arena_or_ui_colors(self):
        template = np.full((28, 29, 3), [220, 50, 180], dtype=np.uint8)
        template[4:24, 6:22] = [240, 190, 70]
        template[9:20, 11:17] = [190, 40, 150]
        for color in ([0, 0, 0], [225, 180, 145], [235, 190, 70], [200, 40, 170]):
            pixels = np.full((652, 368, 3), color, dtype=np.uint8)
            self.assertEqual(clock_matches(pixels, template), [])
        pixels = np.zeros((652, 368, 3), dtype=np.uint8)
        pixels[390:418, 30:59] = template
        matches = clock_matches(pixels, template)
        self.assertEqual(len(matches), 1)
        self.assertEqual([matches[0]["x"], matches[0]["y"]], [44.5, 404.0])
