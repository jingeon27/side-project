import unittest

import numpy as np

from clash_bot.arena.sim.rules import TILE, Action
from clash_bot.arena.training.bandits import pick, root_priors, root_subset


class CardBanditsTest(unittest.TestCase):
    def test_zero_probability_spend_is_not_added_by_root_selection_or_unvisited_coverage(self):
        actions = [Action(-1), Action(2, TILE, TILE), Action(2, 2 * TILE, TILE)]
        prior = np.array([0.3, 0.7, 0])
        rng = np.random.default_rng(2)
        self.assertEqual(root_subset(actions, prior, rng, 8, True), [0, 1])
        edges = {actions[i]: {"n": 1, "w": 0, "p": prior[i], "available": 1} for i in (0, 1)}
        self.assertIn(pick(edges, actions, prior, rng, 1.5, cover=True), actions[:2])

    def test_root_compares_spaced_positions_for_a_low_prior_defender_before_more_barrel_tiles(self):
        actions = [
            Action(-1),
            *[Action(0, TILE * x, 0) for x in range(8)],
            *[Action(6, TILE * x, 0) for x in range(4)],
        ]
        prior = np.array([0.05, *([0.1] * 8), 0.06, 0.05, 0.03, 0.01])
        kept = root_subset(actions, prior, np.random.default_rng(4), 5, False, focus=(6,))
        self.assertEqual([actions[i].card for i in kept], [-1, 0, 0, 6, 6])
        self.assertEqual([actions[i].x for i in kept if actions[i].card == 6], [0, 2 * TILE])
        self.assertEqual([actions[i].x for i in kept if actions[i].card == 0], [0, 2 * TILE])

    def test_exploration_retains_each_cards_original_best_placement(self):
        actions = [Action(-1), *[Action(c, x, 0) for c in range(3) for x in range(20)]]
        prior = np.arange(1, len(actions) + 1, dtype=float)
        prior /= prior.sum()
        anchors = [
            max((i for i, a in enumerate(actions) if a.card == c), key=lambda i: prior[i])
            for c in (-1, 0, 1, 2)
        ]
        for seed in range(20):
            kept = root_subset(actions, prior, np.random.default_rng(seed), 8, True)
            self.assertTrue(set(anchors).issubset(kept))

    def test_pruning_placements_does_not_inflate_wait(self):
        actions = [Action(-1), *[Action(5, x, 0) for x in range(250)]]
        prior = np.array([0.1, *[0.9 / 250] * 250])
        np.testing.assert_allclose(root_priors(actions, prior, [0, 1]), [0.1, 0.9])
        np.testing.assert_allclose(root_priors(actions, prior, [0, 1, 2]), [0.1, 0.45, 0.45])

    def test_root_represents_every_card_family_and_always_keeps_wait(self):
        actions = [Action(-1), Action(-2), *[Action(c, x, 0) for c in range(4) for x in range(80)]]
        prior = np.ones(len(actions)) / len(actions)
        for noise in (True, False):
            kept = root_subset(actions, prior, np.random.default_rng(4), 8, noise)
            self.assertEqual(len(kept), 8)
            self.assertEqual({actions[index].card for index in kept}, {-2, -1, 0, 1, 2, 3})
        kept = root_subset(actions, prior, np.random.default_rng(4), 2, False)
        self.assertIn(0, kept)

    def test_bandit_uses_card_mass_and_root_coverage_but_can_learn_to_wait(self):
        actions = [Action(-1), *[Action(5, x, 0) for x in range(4)]]
        prior, edges, rng = np.array([0.3, *[0.175] * 4]), {}, np.random.default_rng(2)
        selected = pick(edges, actions, prior, rng, 1.5, cover=True)
        self.assertEqual(selected.card, 5)
        for _ in range(len(actions)):
            selected = pick(edges, actions, prior, rng, 1.5, cover=True)
            edges[selected]["n"] += 1
        self.assertTrue(all(edge["n"] for edge in edges.values()))
        for action, edge in edges.items():
            edge.update(n=20, w=18 if action.card == -1 else -18)
        self.assertEqual(pick(edges, actions, prior, rng, 1.5).card, -1)


if __name__ == "__main__":
    unittest.main()
