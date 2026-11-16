import json
import unittest

from clash_bot.paths import FIXTURES_DIR
from clash_bot.qwen.decision_input import opponent_prompt, serialize_decision


class CompactDecisionInputTest(unittest.TestCase):
    def test_cross_language_contract(self):
        fixture = json.loads((FIXTURES_DIR / "decision-context.json").read_text())
        self.assertEqual(serialize_decision(fixture["context"]), fixture["prompt"])

    def test_opponent_input_does_not_include_the_observed_future_action(self):
        state = {
            "at": 1000,
            "own": {"units": []},
            "opponent": {"units": [], "elixir": {"min": 0, "max": 10}},
        }
        before = {
            "situation": state,
            "before_at": 1000,
            "card": "graveyard",
            "lane": "right",
            "candidates": [
                {"card": None, "target": {"x": 0}},
                {"card": "graveyard", "target": {"x": 273}},
            ],
        }
        self.assertEqual(
            opponent_prompt(before), opponent_prompt({**before, "card": "poison", "lane": "left"})
        )
        with self.assertRaisesRegex(ValueError, "Future"):
            opponent_prompt({**before, "before_at": 800})


if __name__ == "__main__":
    unittest.main()
