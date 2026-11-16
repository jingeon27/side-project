"""Preserve the existing promotion decision while replacing its manual formula."""

import math
import unittest

from .statistics import paired_win_probability


class PairedWinProbabilityTests(unittest.TestCase):
    def test_matches_the_legacy_exact_tail_and_spent_alpha_decisions(self):
        alphas = [0.05 / ((index + 1) * (index + 2)) for index in range(128)]
        for decisive in [*range(1, 65), 96, 128, 256]:
            for wins in range(decisive + 1):
                legacy = (
                    sum(math.comb(decisive, count) for count in range(wins, decisive + 1))
                    / 2**decisive
                )
                actual = paired_win_probability(wins, decisive - wins)
                self.assertAlmostEqual(actual, legacy, places=13)
                self.assertEqual(
                    [actual <= alpha for alpha in alphas], [legacy <= alpha for alpha in alphas]
                )

    def test_zero_decisive_pairs_and_invalid_counts(self):
        self.assertEqual(paired_win_probability(0, 0), 1.0)
        for wins, losses in [(-1, 0), (1.5, 1), (True, 0)]:
            with self.assertRaises(ValueError):
                paired_win_probability(wins, losses)
