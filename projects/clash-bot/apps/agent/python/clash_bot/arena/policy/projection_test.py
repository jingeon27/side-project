import unittest

import numpy as np

from clash_bot.arena.policy.projection import project_logits


class DensePartitionTest(unittest.TestCase):
    def test_three_hundred_tiles_do_not_change_card_odds_against_one_wait(self):
        scores = np.log([0.3, *([0.7 / 300] * 300)])
        projected = np.exp(project_logits(scores, [-1, *([5] * 300)], [0, 148]))
        projected /= projected.sum()
        np.testing.assert_allclose(projected, [0.3, 0.7], atol=1e-7)

    def test_nonuniform_positions_preserve_each_card_mass_and_retained_position_odds(self):
        scores = np.log([0.2, 0.1, 0.3, 0.15, 0.25])
        kept = [0, 1, 2, 4]
        projected = np.exp(project_logits(scores, [-1, 5, 5, 7, 7], kept))
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
                project_logits(scores, families, kept)

    def test_omitted_placement_changes_its_card_mass_at_the_new_weights(self):
        def loss(weight):
            scores = project_logits([0, 2 * weight, 0], [5, 5, -1], [0, 2])
            return -np.array([0.9, 0.1]) @ (scores - np.logaddexp.reduce(scores))

        derivative = (loss(1e-5) - loss(-1e-5)) / 2e-5
        # A frozen offset on the retained tile's constant logit incorrectly gives zero.
        self.assertAlmostEqual(derivative, 2 / 3 - 0.9, places=6)
