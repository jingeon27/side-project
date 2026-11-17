import unittest

import numpy as np

from clash_bot.arena.policy.features import forward
from clash_bot.arena.policy.network import Policy
from clash_bot.arena.policy.samples import SparseFeatures
from clash_bot.arena.policy.screen import Screen
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.search import search
from clash_bot.arena.training.selfplay import SELFPLAY
from clash_bot.arena.training.targets import training_rows


class SearchedTargetsTest(unittest.TestCase):
    def test_unvisited_and_unsearched_actions_are_not_negative_labels(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        observation = arena.observe(0)
        candidates = [Action(*row) for row in observation["legalActions"]]
        result = {
            "actions": candidates[:3],
            "target": np.array([0.4, 0, 0.6]),
            "visits": [4, 0, 6],
        }
        screen = Screen(SELFPLAY.perception, np.random.default_rng(1))
        screen.watch(observation)
        row = training_rows(observation, result, screen, 2, Policy())
        self.assertEqual(row["actions"], [candidates[0].row(), candidates[2].row()])
        self.assertEqual(row["target"], [0.4, 0.6])
        self.assertEqual(row["chosen"], 1)

    def test_learning_subset_reproduces_the_dense_collecting_policy_card_masses(self):
        arena = Arena(7)
        arena.play([Action(-1)] * 2, 140)
        observation = arena.observe(0)
        available = [Action(*row) for row in observation["legalActions"]]
        policy = Policy()
        screen = Screen(SELFPLAY.perception, np.random.default_rng(3))
        context = screen.read(observation, available)
        prior = policy.read(context)[0]
        indexes = list(dict.fromkeys(a.card for a in available))
        kept = [next(i for i, a in enumerate(available) if a.card == card) for card in indexes]

        class FrozenScreen:
            def read(self, _observation, _actions):
                return context

        result = {
            "actions": [available[i] for i in kept],
            "target": np.full(len(kept), 1 / len(kept)),
            "visits": [1] * len(kept),
        }
        row = training_rows(observation, result, FrozenScreen(), 0, policy)
        scores = forward(
            policy.weights,
            SparseFeatures.model_validate(row["features"]).dense(),
            np.array(row["actionFeatures"]),
        )[0]
        scores += np.array(row["actionBias"]) + np.array(row["actionLogMassCorrection"])
        projected = np.exp(scores - np.max(scores))
        projected /= projected.sum()
        expected = [
            sum(p for a, p in zip(available, prior) if a.card == available[i].card) for i in kept
        ]
        np.testing.assert_allclose(projected, expected, atol=1e-6)

    def test_normal_budget_visits_every_root_candidate_and_leaves_room_for_revisits(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        result = search(arena.observe(0), Policy(), 17, simulations=16, depth=2, noise=True)
        self.assertEqual(result["simulations"], 16)
        self.assertLessEqual(len(result["actions"]), 8)
        self.assertTrue((result["target"] > 0).all())


if __name__ == "__main__":
    unittest.main()
