"""The promotion gate without MLX, so CI checks it on every change."""

import unittest

from clash_bot.qwen.promotion import qualification_scores

METHOD = "paired_exact_wins_v1"
# The second qualification attempt spends 0.05 / (2 * 3) of the family-wise budget.
SECOND_ATTEMPT_ALPHA = 0.05 / 6


class PromotionGateTests(unittest.TestCase):
    def test_requires_sixteen_valid_pair_scores(self):
        with self.assertRaises(ValueError):
            qualification_scores([1.0] * 15, 0.025, METHOD)
        with self.assertRaises(ValueError):
            qualification_scores([1.0] * 15 + [0.7], 0.025, METHOD)

    def test_needs_seven_decisive_wins_within_the_second_attempt_budget(self):
        result = qualification_scores([1.0] * 7 + [0.5] * 9, SECOND_ATTEMPT_ALPHA, METHOD)
        self.assertEqual(result["test"], "exact_paired_binomial")
        self.assertLessEqual(result["oneSidedP"], SECOND_ATTEMPT_ALPHA)
        with self.assertRaises(ValueError):
            qualification_scores([1.0] * 6 + [0.5] * 10, SECOND_ATTEMPT_ALPHA, METHOD)

    def test_rejects_an_even_split_below_the_mean_score_floor(self):
        with self.assertRaises(ValueError):
            qualification_scores([1.0] * 8 + [0.0] * 8, 0.025, METHOD)


if __name__ == "__main__":
    unittest.main()
