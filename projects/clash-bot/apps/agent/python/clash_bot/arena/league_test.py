"""A new league publishes its champion's live policy, and only the current league.json resumes."""

import json
import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from clash_bot.arena.fast_features import checksum
from clash_bot.arena.league import checkpoint, initialize, publish_champion
from clash_bot.arena.policy import Policy

RULES = {"id": "r" * 64}


class LeagueTest(unittest.TestCase):
    def test_a_new_league_publishes_the_initial_champion_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            self.assertEqual((league["learner"], league["champion"]), (0, 0))
            live = json.loads((root / "champion-policy.json").read_text())
            stored = Policy.load(checkpoint(root, 0), RULES["id"])
            self.assertEqual(live["weightsSHA256"], stored.checksum())
            self.assertEqual(live["weightsSHA256"], checksum(stored.weights))
            self.assertEqual(live["rulesID"], RULES["id"])
            # Resuming reads the same pointer back through the current schema.
            self.assertEqual(initialize(root, RULES), league)

    def test_a_promoted_champion_replaces_the_published_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            promoted = Policy(seed=5, metadata={"version": 1, "rulesID": RULES["id"]})
            promoted.save(checkpoint(root, 1), {"role": "qualified_champion"})
            publish_champion(root, {**league, "champion": 1})
            live = json.loads((root / "champion-policy.json").read_text())
            self.assertEqual(live["weightsSHA256"], promoted.checksum())
            self.assertEqual(live["version"], 1)

    def test_a_league_file_of_another_format_is_not_resumed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            for change in [{"format": "clash-arena-league-v0"}, {"opponents": []}, {"extra": 1}]:
                with self.subTest(change=sorted(change)):
                    (root / "league.json").write_text(json.dumps({**league, **change}))
                    with self.assertRaises(ValidationError):
                        initialize(root, RULES)


if __name__ == "__main__":
    unittest.main()
