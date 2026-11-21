import unittest

import numpy as np

from clash_bot.arena.sim.candidates import dense_actions
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.rollout import rollout_choices


class UniformPolicy:
    def predict(self, observation, actions):
        return np.full(len(actions), 1 / len(actions)), 0


class RolloutProbabilityTest(unittest.TestCase):
    def test_coarse_future_reproduces_dense_card_mass_for_constant_position_scores(self):
        arena = Arena(7)
        arena.play([Action(-1)] * 2, 140)
        dense = dense_actions(arena.battle, 0)
        selected, prior = rollout_choices(arena, 0, UniformPolicy(), np.random.default_rng(2))
        self.assertLess(len(selected), len(dense))
        for family in {a.card for a in dense}:
            self.assertAlmostEqual(
                sum(p for a, p in zip(selected, prior) if a.card == family),
                sum(a.card == family for a in dense) / len(dense),
                places=7,
            )
