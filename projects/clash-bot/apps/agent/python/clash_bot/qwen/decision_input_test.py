import json
import unittest

from clash_bot.paths import FIXTURES_DIR
from clash_bot.qwen.decision_input import mirror_actor_prompt, serialize_decision


class CompactDecisionInputTest(unittest.TestCase):
    def test_cross_language_contract(self):
        fixture = json.loads((FIXTURES_DIR / "decision-context.json").read_text())
        self.assertEqual(serialize_decision(fixture["context"]), fixture["prompt"])

    def test_mirror_actor_cross_language_contract(self):
        fixture = json.loads((FIXTURES_DIR / "mirror-actor-context.json").read_text())
        self.assertEqual(mirror_actor_prompt(fixture["sample"]), fixture["prompt"])

    def test_opponent_input_does_not_include_the_observed_future_action(self):
        state = {
            "at": 1000,
            "own": {"units": [], "recentPlays": []},
            "opponent": {"units": [], "elixir": {"min": 0, "max": 10}},
        }
        before = {
            "situation": state,
            "river_y": 276,
            "before_at": 1000,
            "card": "graveyard",
            "lane": "right",
            "candidates": [
                {"card": None, "cost": 0, "target": {"x": 0, "y": 0}},
                {"card": "graveyard", "cost": 5, "target": {"x": 273, "y": 140}},
            ],
        }
        self.assertEqual(
            mirror_actor_prompt(before),
            mirror_actor_prompt({**before, "card": "poison", "lane": "left"}),
        )
        with self.assertRaisesRegex(ValueError, "Future"):
            mirror_actor_prompt({**before, "before_at": 800})


if __name__ == "__main__":
    unittest.main()
