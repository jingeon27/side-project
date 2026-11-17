import tempfile
import unittest
from pathlib import Path

import numpy as np

from clash_bot.arena.policy.features import forward, hide_towers
from clash_bot.arena.policy.network import Policy, features
from clash_bot.arena.policy.samples import SparseFeatures
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.selfplay import play_game, replay_samples


class ExpertIterationTest(unittest.TestCase):
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
            "target": [1.0] + [0.0] * (len(actions) - 1),
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
