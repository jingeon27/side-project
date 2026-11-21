import tempfile
import unittest
from copy import deepcopy
from pathlib import Path

import numpy as np

from clash_bot.arena.policy.dense import DenseActions
from clash_bot.arena.policy.features import forward, hide_towers
from clash_bot.arena.policy.network import Policy, features
from clash_bot.arena.policy.optimizer import defense_loss
from clash_bot.arena.policy.samples import SparseFeatures
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.replay import replay_samples
from clash_bot.arena.training.selfplay import play_game


class ExpertIterationTest(unittest.TestCase):
    def test_defense_loss_ranks_tiles_and_differentiates_full_card_mass(self):
        import mlx.core as mx

        scores = mx.array([[0.0, 0.0, 0.0, 10.0]])
        families = mx.array([[0, 0, 1, 1]])
        source = mx.array([[True, True, True, False]])

        def gradient(left, right):
            pairs = mx.array([[[left, right]]])
            return np.asarray(
                mx.grad(
                    lambda logits: defense_loss(logits, families, source, pairs, mx.array([[True]]))
                )(scores)
            )[0]

        self.assertLess(gradient(0, 1)[0], 0)
        self.assertGreater(gradient(0, 1)[1], 0)
        self.assertEqual(gradient(0, 1)[2], 0)
        across = gradient(0, 2)
        self.assertLess(across[0], 0)
        self.assertAlmostEqual(across[0], across[1])
        self.assertGreater(across[2], 0)
        self.assertEqual(across[3], 0)

    def test_rollout_predict_does_not_reintroduce_unread_tower_hitpoints(self):
        arena = Arena(4)
        arena.play([Action(-1)] * 2, 120)
        observation = arena.observe(0)
        changed = deepcopy(observation)
        changed["state"]["players"][0]["tower_hp"] = [700, 800, 900]
        changed["state"]["players"][1]["tower_hp"] = [900, 1000, 1100]
        actions = [Action(*a) for a in observation["legalActions"]]
        policy = Policy()
        np.testing.assert_array_equal(
            policy.predict(observation, actions)[0], policy.predict(changed, actions)[0]
        )

    def test_real_gradient_checkpoint_roundtrip_and_unknown_outcome_rejection(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        obs = arena.observe(0)
        actions = [Action(*row) for row in obs["legalActions"]]
        state, action_vectors = features(obs, actions)
        row = {
            "features": SparseFeatures.of(state).model_dump(),
            "actions": [a.row() for a in actions],
            "actionFeatures": action_vectors.tolist(),
            "actionBias": [0.7] + [-0.5] * (len(actions) - 1),
            "actionBiasWithoutTowers": [1.3] + [-0.8] * (len(actions) - 1),
            "source": DenseActions.pack(
                action_vectors,
                [a.card for a in actions],
                [0.7] + [-0.5] * (len(actions) - 1),
                [1.3] + [-0.8] * (len(actions) - 1),
                list(range(len(actions))),
            ).model_dump(),
            "target": [1.0] + [0.0] * (len(actions) - 1),
            "targetWithoutTowers": [1.0] + [0.0] * (len(actions) - 1),
            "defensePairs": [],
            "attackPairs": [],
            "outcome": 1,
            "value": 0.8,
        }
        policy = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        logits, _probabilities, value = forward(policy.weights, hide_towers(state), action_vectors)
        scores = logits + np.array(row["actionBiasWithoutTowers"])
        logp = scores - np.logaddexp.reduce(scores)
        expected = -logp[0] + (value - row["value"]) ** 2
        report = policy.train([row], 2, epochs=1)
        self.assertAlmostEqual(report["meanLoss"], expected, places=4)
        self.assertTrue(report["updated"])
        self.assertNotEqual(report["beforeSHA256"], report["afterSHA256"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model"
            policy.save(path, {"training": report})
            restored = Policy.load(path, "rules-a")
            self.assertEqual(restored.checksum(), policy.checksum())
            # Every learner step keeps only compressed weights; live JSON is written on publish.
            self.assertEqual(
                sorted(file.name for file in path.iterdir()), ["metadata.json", "weights.npz"]
            )
            live = restored.live("c" * 64)
            self.assertEqual(live["weightsSHA256"], policy.checksum())
            self.assertEqual((live["rulesID"], live["catalogue"]), ("rules-a", "c" * 64))
            np.testing.assert_array_equal(
                restored.predict(obs, actions)[0], policy.predict(obs, actions)[0]
            )
            with self.assertRaisesRegex(ValueError, "rule set"):
                Policy.load(path, "rules-b")
        before = policy.checksum()
        with self.assertRaises(ValueError):
            policy.train([{**row, "outcome": None}], 7)
        self.assertEqual(before, policy.checksum())

    def test_a_checkpoint_with_another_network_layout_is_not_loaded(self):
        policy = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model"
            policy.save(path, {})
            np.savez_compressed(
                path / "weights.npz",
                **{**policy.weights, "encoder.bias": np.zeros(7, np.float32)},
            )
            with self.assertRaisesRegex(ValueError, "LEAGUE_KEY"):
                Policy.load(path, "rules-a")

    def test_truncated_games_never_become_draw_labels(self):
        policy = Policy()
        game = play_game(
            [policy, policy], "truncate-contract", "rules-a", simulations=2, depth=2, max_ticks=240
        )
        self.assertFalse(game["completed"])
        self.assertIsNone(game["winner"])
        self.assertEqual(game["samples"], [])
        self.assertGreater(game["truncatedSamplesDiscarded"], 0)
        accepted = {"completed": True, "rulesID": "rules-a", "samples": [{"outcome": 1, "id": "a"}]}
        stale = {"completed": True, "rulesID": "rules-b", "samples": [{"outcome": -1, "id": "b"}]}
        self.assertEqual(replay_samples([accepted, stale, game], "rules-a"), accepted["samples"])


if __name__ == "__main__":
    unittest.main()
