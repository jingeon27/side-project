import json
import unittest

import numpy as np
from pydantic import ValidationError

from clash_bot.perception.trophy_vision import (
    INPUT,
    clear_siege_identity,
    identity,
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

    def test_low_score_siege_identity_needs_hostile_color_and_clear_class_margin(self):
        box = [25, 280, 76, 347]
        scores = {"royal-giant": 0.29, "royal-giant-evolution": 0.2, "giant": 0.1}
        self.assertTrue(
            clear_siege_identity("royal_giant", "royal-giant", scores, box, "red", {"red": 35})
        )
        self.assertFalse(
            clear_siege_identity("royal_giant", "royal-giant", scores, box, "blue", {"red": 35})
        )
        scores["giant"] = 0.23
        self.assertFalse(
            clear_siege_identity("royal_giant", "royal-giant", scores, box, "red", {"red": 35})
        )

    def test_mother_witch_uses_the_policy_catalogue_key(self):
        self.assertEqual(identity("mother-witch"), "witch_mother")
