import unittest

import numpy as np

from clash_bot.arena.policy.projection import log_mass_correction


class DensePartitionTest(unittest.TestCase):
    def test_three_hundred_tiles_do_not_change_card_odds_against_one_wait(self):
        scores = np.log([0.3, *([0.7 / 300] * 300)])
        offsets = log_mass_correction(scores, [-1, *([5] * 300)], [0, 148])
        projected = np.exp(scores[[0, 148]] + offsets)
        projected /= projected.sum()
        np.testing.assert_allclose(projected, [0.3, 0.7], atol=1e-7)

    def test_nonuniform_positions_preserve_each_card_mass_and_retained_position_odds(self):
        scores = np.log([0.2, 0.1, 0.3, 0.15, 0.25])
        kept = [0, 1, 2, 4]
        offsets = log_mass_correction(scores, [-1, 5, 5, 7, 7], kept)
        projected = np.exp(scores[kept] + offsets)
        projected /= projected.sum()
        np.testing.assert_allclose(projected, [0.2, 0.1, 0.3, 0.4], atol=1e-7)

    def test_invalid_projection_is_rejected_instead_of_becoming_wait(self):
        for scores, families, kept in [
            ([0], [5], []),
            ([0], [5], [0, 0]),
            ([0], [5], [1]),
            ([float("nan")], [5], [0]),
        ]:
            with self.subTest(kept=kept), self.assertRaises(ValueError):
                log_mass_correction(scores, families, kept)
