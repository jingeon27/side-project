import json
import unittest

import numpy as np

from clash_bot.arena.policy.choice import card_choice, sample_card
from clash_bot.paths import FIXTURES_DIR


class CardChoiceTest(unittest.TestCase):
    def test_shared_runtime_cases(self):
        fixture = json.loads((FIXTURES_DIR / "fast-choice-cases.json").read_text())
        for case in fixture["cases"]:
            with self.subTest(case["name"]):
                self.assertEqual(
                    card_choice(case["families"], case["probabilities"]), case["choice"]
                )

    def test_temperature_does_not_make_split_placements_lose_to_wait(self):
        rng = np.random.default_rng(4)
        families = [-1, *[5] * 5]
        # The card has mass .75, even though each tile has less than wait's .25.
        samples = [sample_card(families, [0.25, *[0.15] * 5], rng, 0.35) for _ in range(1000)]
        self.assertGreater(sum(index != 0 for index in samples), 940)
        self.assertEqual(set(samples), set(range(6)))

    def test_invalid_distributions_are_errors(self):
        for families, probabilities in (
            ([], []),
            ([-1], []),
            ([-1], [0]),
            ([-1], [float("nan")]),
            ([-1, -2], [-1, 2]),
        ):
            with self.subTest(probabilities=probabilities), self.assertRaises(ValueError):
                card_choice(families, probabilities)
        with self.assertRaises(ValueError):
            sample_card([-1], [1], np.random.default_rng(1), 0)


if __name__ == "__main__":
    unittest.main()
