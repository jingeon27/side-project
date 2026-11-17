import copy
import unittest

from clash_bot.arena.sim.conditioning import position_error


def field():
    return {
        "units": [[0, 0, 5, -1, 0, 0, 100, 100, 7]],
        "towers": [[[100, 100, 100], 0, False]],
        "spells": [],
    }


class PositionConditioningTest(unittest.TestCase):
    def test_mobile_position_is_bounded_and_exact_mode_stays_exact(self):
        a, b = field(), field()
        self.assertEqual(position_error(a, b, 0), 0)
        b["units"][0][4] = 0.12
        self.assertAlmostEqual(position_error(a, b, 0.25), 0.12)
        self.assertIsNone(position_error(a, b, 0))
        b["units"][0][4] = 0.251
        self.assertIsNone(position_error(a, b, 0.25))

    def test_no_combat_facts_are_relaxed_by_the_position_tolerance(self):
        for index in (0, 1, 2, 3, 6, 7, 8):
            a, b = field(), field()
            b["units"][0][index] += 1
            with self.subTest(index=index):
                self.assertIsNone(position_error(a, b, 0.25))
        for key, replacement in [("units", []), ("towers", []), ("spells", [[1, 2, 3, 4, 5]])]:
            a, b = field(), field()
            b[key] = replacement
            self.assertIsNone(position_error(a, b, 0.25))

    def test_building_and_tower_coordinates_must_remain_exact(self):
        for kind in (1, 2, 3):
            a = field()
            a["units"][0][1] = kind
            b = copy.deepcopy(a)
            b["units"][0][4] = 0.01
            self.assertIsNone(position_error(a, b, 0.25))

    def test_crowded_identical_units_require_a_complete_assignment(self):
        a, b = field(), field()
        a["units"].append([0, 0, 5, -1, 0.15, 0, 100, 100, 7])
        b["units"][0][4] = 0.1
        b["units"].append([0, 0, 5, -1, -0.1, 0, 100, 100, 7])
        self.assertAlmostEqual(position_error(a, b, 0.2), 0.1)

    def test_invalid_tolerances_are_rejected(self):
        for tolerance in (-1, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                position_error(field(), field(), tolerance)
