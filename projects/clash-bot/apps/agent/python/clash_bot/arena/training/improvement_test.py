import unittest

import numpy as np

from clash_bot.arena.training.improvement import SPEC, improved_policy


class SearchImprovementTest(unittest.TestCase):
    def test_compulsory_visits_with_equal_values_do_not_flatten_the_prior(self):
        prior = [0.99, 0.01]
        for visits in ([1, 15], [15, 1]):
            result = improved_policy(prior, [0.2, 0.2], visits)
            np.testing.assert_allclose(result["target"], prior, atol=1e-7)

    def test_a_losing_trial_does_not_receive_a_minimum_visit_fraction_as_its_label(self):
        result = improved_policy([0.8, 0.2], [0.7, -0.8], [15, 1])
        self.assertLess(result["target"][1], 1 / 16)
        self.assertGreaterEqual(result["targetValue"], result["priorValue"])
        self.assertLessEqual(result["targetKL"], SPEC.maxKL + 1e-8)

    def test_unvisited_placements_are_not_invented_expert_values(self):
        result = improved_policy([0.2, 0.3, 0.5], [0.1, 0.1, 1000], [1, 2, 0])
        np.testing.assert_allclose(result["target"], [0.4, 0.6, 0], atol=1e-7)

    def test_invalid_search_cannot_make_a_training_distribution(self):
        for prior, values, visits in [
            ([], [], []),
            ([1], [0], [0]),
            ([1], [float("nan")], [1]),
            ([0], [1], [1]),
        ]:
            with self.subTest(prior=prior), self.assertRaises(ValueError):
                improved_policy(prior, values, visits)
