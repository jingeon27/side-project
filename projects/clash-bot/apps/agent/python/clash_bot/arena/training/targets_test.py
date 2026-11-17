import unittest

import numpy as np

from clash_bot.arena.policy.network import Policy
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
        }
        screen = Screen(SELFPLAY.perception, np.random.default_rng(1))
        screen.watch(observation)
        rows, _state, _features, _biases, _masked_biases, target, chosen = training_rows(
            observation, result, screen, 2
        )
        self.assertEqual(rows, [candidates[0], candidates[2]])
        self.assertEqual(target, [0.4, 0.6])
        self.assertEqual(chosen, 1)

    def test_normal_budget_visits_every_root_candidate_and_leaves_room_for_revisits(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        result = search(arena.observe(0), Policy(), 17, simulations=16, depth=2, noise=True)
        self.assertEqual(result["simulations"], 16)
        self.assertLessEqual(len(result["actions"]), 8)
        self.assertTrue((result["target"] > 0).all())


if __name__ == "__main__":
    unittest.main()
