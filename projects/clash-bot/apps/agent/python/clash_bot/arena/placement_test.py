"""The simulator's placement tiles are the ones the live TypeScript candidates use."""

import json
import unittest

from clash_bot.arena.placement import (
    DEPLOYMENT,
    FIELD_GRID,
    LANES,
    OWN_GRID,
    placement_grid,
    placement_tiles,
)
from clash_bot.paths import FIXTURES_DIR

FIXTURE = json.loads((FIXTURES_DIR / "fast-candidate-cases.json").read_text())


def tiles(rows):
    return [tuple(row) for row in rows]


def pairs(values):
    return list(zip(values[::2], values[1::2]))


class SharedPlacementTest(unittest.TestCase):
    def test_rule_tiles_and_grids_match_the_shared_cases(self):
        self.assertEqual(OWN_GRID, pairs(FIXTURE["ownGrid"]))
        self.assertEqual(FIELD_GRID, pairs(FIXTURE["fieldGrid"]))
        grids = {"own": lambda targets: OWN_GRID, "field": lambda targets: [*targets, *FIELD_GRID]}
        for case in FIXTURE["cases"]:
            threat = tuple(case["threat"]) if case["threat"] else None
            targets = tiles(case["targets"])
            with self.subTest(placement=case["placement"], threat=threat):
                self.assertEqual(
                    placement_tiles(case["placement"], threat, targets), tiles(case["rule"])
                )
                self.assertEqual(
                    placement_grid(case["placement"], targets),
                    grids.get(case["grid"], lambda targets: [])(targets),
                )

    def test_every_rule_kind_is_covered_and_no_rule_offers_more_than_six_tiles(self):
        kinds = {case["placement"] for case in FIXTURE["cases"]}
        self.assertEqual(
            kinds,
            {
                "troop",
                "ranged_troop",
                "rolling_spell",
                "building",
                "area_spell",
                "spawn_spell",
                "tower_spell",
                "anywhere",
                "unsupported",
            },
        )
        self.assertTrue(all(len(case["rule"]) <= 6 for case in FIXTURE["cases"]))
        # Troops keep both tiles behind the king tower among their six.
        self.assertEqual(LANES[-2:], list(DEPLOYMENT.kingBackTiles))


if __name__ == "__main__":
    unittest.main()
