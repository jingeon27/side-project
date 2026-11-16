import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from clash_bot.arena.engine import Action, Arena
from clash_bot.arena.policy import Policy, features
from clash_bot.arena.selfplay import play_game, replay_samples


class ExpertIterationTest(unittest.TestCase):
    def test_real_gradient_checkpoint_roundtrip_and_unknown_outcome_rejection(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        obs = arena.observe(0)
        actions = [Action(*row) for row in obs["legalActions"]]
        state, action_vectors = features(obs, actions)
        row = {
            "features": state.tolist(),
            "actions": [a.row() for a in actions],
            "actionFeatures": action_vectors.tolist(),
            "target": [1.0] + [0.0] * (len(actions) - 1),
            "outcome": 1,
        }
        policy = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        report = policy.train([row], 7, epochs=2)
        self.assertTrue(report["updated"])
        self.assertNotEqual(report["beforeSHA256"], report["afterSHA256"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model"
            policy.save(path, {"training": report})
            restored = Policy.load(path, "rules-a")
            self.assertEqual(restored.checksum(), policy.checksum())
            live = json.loads((path / "policy.json").read_text())
            self.assertEqual(live["weightsSHA256"], policy.checksum())
            self.assertEqual(live["rulesID"], "rules-a")
            np.testing.assert_array_equal(
                restored.predict(obs, actions)[0], policy.predict(obs, actions)[0]
            )
            with self.assertRaisesRegex(ValueError, "rule set"):
                Policy.load(path, "rules-b")
        before = policy.checksum()
        with self.assertRaises(ValueError):
            policy.train([{**row, "outcome": None}], 7)
        self.assertEqual(before, policy.checksum())

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
