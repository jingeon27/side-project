import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from clash_bot.arena.catalogue import current
from clash_bot.arena.champions import initialize
from clash_bot.arena.sim.balance import (
    Articles,
    changed_fields,
    classify,
    old_enough,
    relevant_rows,
)


class BalanceContractsTest(unittest.TestCase):
    def test_unrelated_merge_mode_is_excluded_and_recent_releases_wait(self):
        parser = Articles()
        parser.feed(
            '<a href="/en/games/clashroyale/blog/a/">October Balance Changes</a>'
            '<a href="/en/games/clashroyale/blog/b/">Merge Tactics Balance Changes</a>'
        )
        self.assertEqual([row["title"] for row in parser.links], ["October Balance Changes"])
        now = datetime.now(timezone.utc)
        asset = {"upload_time_iso_8601": (now - timedelta(hours=23)).isoformat()}
        self.assertFalse(old_enough(asset, now))
        self.assertTrue(
            old_enough(
                {**asset, "upload_time_iso_8601": (now - timedelta(hours=25)).isoformat()}, now
            )
        )

    def test_child_unit_changes_are_reported_and_rule_changes_require_new_league(self):
        base = {
            "cards": [{"name": "Knight", "speed": 60}],
            "units": {"FireSpirit": {"name": "FireSpirit", "damage": 10}},
        }
        next_table = {**base, "units": {"FireSpirit": {"name": "FireSpirit", "damage": 12}}}
        self.assertEqual(
            changed_fields(relevant_rows(base), relevant_rows(next_table)),
            [{"field": "units.FireSpirit.damage", "before": 10, "after": 12}],
        )
        with tempfile.TemporaryDirectory() as directory:
            initialize(directory, {"id": "rules-a", "catalogue": current().id})
            with self.assertRaisesRegex(ValueError, "separate league"):
                initialize(directory, {"id": "rules-b", "catalogue": current().id})

    def test_a_patch_separates_number_changes_from_mechanic_changes(self):
        base = {
            "cards": [{"name": "Poison", "damage": 100, "radius": 3500}, {"name": "Knight"}],
            "units": {"Skeleton": {"name": "Skeleton", "hitpoints": 81, "targets": "ground"}},
        }
        patched = {
            "cards": [{"name": "Poison", "damage": 95, "radius": 3500}, {"name": "Knight"}],
            "units": {
                "Skeleton": {"name": "Skeleton", "hitpoints": 81, "targets": "air_ground"},
                "SpearGoblin": {"name": "SpearGoblin", "hitpoints": 133},
            },
        }
        changes = classify(relevant_rows(base), relevant_rows(patched))
        self.assertEqual(
            [(row["object"], row["kind"]) for row in changes],
            [
                ("cards.Poison", "stats"),
                ("units.Skeleton", "mechanics"),
                ("units.SpearGoblin", "mechanics"),
            ],
        )
        self.assertEqual(
            changes[0]["fields"], [{"field": "cards.Poison.damage", "before": 100, "after": 95}]
        )
        # A flag is not a number even though Python treats bool as int.
        flag = classify({"cards.Knight": {"evolves": False}}, {"cards.Knight": {"evolves": True}})
        self.assertEqual(flag[0]["kind"], "mechanics")


if __name__ == "__main__":
    unittest.main()
