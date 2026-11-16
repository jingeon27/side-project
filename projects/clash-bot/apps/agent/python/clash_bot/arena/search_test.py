import unittest

import numpy as np

from clash_bot.arena.engine import Action, Arena
from clash_bot.arena.policy import Policy, features
from clash_bot.arena.search import Workspace, search


class PublicSearchTest(unittest.TestCase):
    def test_hidden_enemy_hand_changes_neither_features_nor_search(self):
        own = list(range(8))
        first, second = Arena(1, [own, own]), Arena(9, [own, own[::-1]])
        for arena in (first, second):
            arena.play([Action(-1)] * 2, 100)
        self.assertNotEqual(
            first.state()["players"][1]["hand"], second.state()["players"][1]["hand"]
        )
        for left, right in zip(
            features(first.observe(0), [Action(-1)]), features(second.observe(0), [Action(-1)])
        ):
            np.testing.assert_array_equal(left, right)
        policy, workspace = Policy(), Workspace()
        before = first.battle.state_hash()
        a = search(first.observe(0), policy, 123, simulations=8, depth=4, workspace=workspace)
        b = search(second.observe(0), policy, 123, simulations=8, depth=4, workspace=workspace)
        self.assertEqual(a["actions"], b["actions"])
        np.testing.assert_array_equal(a["target"], b["target"])
        self.assertEqual(first.battle.state_hash(), before)
        self.assertAlmostEqual(float(a["target"].sum()), 1)
        self.assertEqual(a["simulations"], 8)
        self.assertEqual(a["maxDepth"], 4)
        self.assertEqual(a["maxLookaheadSeconds"], 8)
        self.assertEqual(a["reconstruction"], "public_board_exact")
        self.assertTrue(
            set(a["actions"]).issubset({Action(*row) for row in first.observe(0)["legalActions"]})
        )


if __name__ == "__main__":
    unittest.main()
