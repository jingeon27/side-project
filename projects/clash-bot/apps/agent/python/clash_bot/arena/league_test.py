"""A league publishes its champion's live policy, and only the current league.json resumes."""

import json
import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from clash_bot.arena.engine import Action, Arena
from clash_bot.arena.fast_features import checksum
from clash_bot.arena.league import checkpoint, export_policy, initialize, publish_champion
from clash_bot.arena.policy import Policy, features
from clash_bot.arena.samples import SparseFeatures
from clash_bot.arena.selfplay import replay_samples
from clash_bot.arena.storage import read_episode, replay_path, write_episode, write_replay

RULES = {"id": "r" * 64}


class LeagueTest(unittest.TestCase):
    def test_a_new_league_publishes_the_initial_champion_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            self.assertEqual((league["learner"], league["champion"]), (0, 0))
            text = (root / "champion-policy.json").read_text()
            self.assertEqual(text.count("\n"), 1)  # Compact: the weights are not one per line.
            live = json.loads(text)
            stored = Policy.load(checkpoint(root, 0), RULES["id"])
            self.assertEqual(live["weightsSHA256"], stored.checksum())
            self.assertEqual(live["weightsSHA256"], checksum(stored.weights))
            self.assertEqual(live["rulesID"], RULES["id"])
            self.assertEqual(stored.metadata["role"], "initial_random_policy")
            self.assertFalse((checkpoint(root, 0) / "policy.json").exists())
            # Resuming reads the same pointer back and repairs a missing live file.
            (root / "champion-policy.json").unlink()
            self.assertEqual(initialize(root, RULES), league)
            self.assertEqual(
                json.loads((root / "champion-policy.json").read_text())["weightsSHA256"],
                stored.checksum(),
            )

    def test_any_checkpoint_can_be_exported_for_live_play(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            initialize(root, RULES)
            learner = Policy(seed=3, metadata={"version": 2, "rulesID": RULES["id"]})
            learner.save(checkpoint(root, 2), {"role": "unqualified_candidate"})
            exported = export_policy(root, 2)
            self.assertEqual(exported["policy"], str(root / "policies/v000002.json"))
            live = json.loads(Path(exported["policy"]).read_text())
            self.assertEqual((live["version"], live["weightsSHA256"]), (2, learner.checksum()))

    def test_a_promoted_champion_replaces_the_published_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            promoted = Policy(seed=5, metadata={"version": 1, "rulesID": RULES["id"]})
            promoted.save(checkpoint(root, 1), {"role": "qualified_champion"})
            publish_champion(root, {**league, "champion": 1})
            live = json.loads((root / "champion-policy.json").read_text())
            self.assertEqual(live["weightsSHA256"], promoted.checksum())
            self.assertEqual(live["version"], 1)

    def test_a_league_file_of_another_format_is_not_resumed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "league"
            league = initialize(root, RULES)
            for change in [{"format": "clash-arena-league-v0"}, {"opponents": []}, {"extra": 1}]:
                with self.subTest(change=sorted(change)):
                    (root / "league.json").write_text(json.dumps({**league, **change}))
                    with self.assertRaises(ValidationError):
                        initialize(root, RULES)


class CompactReplayTest(unittest.TestCase):
    def test_training_reads_compact_replays_without_full_observations(self):
        arena = Arena(1)
        arena.play([Action(-1)] * 2, 100)
        observation = arena.observe(0)
        actions = [Action(*row) for row in observation["legalActions"]]
        state, action_vectors = features(observation, actions)
        sample = {
            "observation": observation,
            "features": SparseFeatures.of(state).model_dump(),
            "actions": [action.row() for action in actions],
            "actionFeatures": action_vectors.tolist(),
            "target": [1.0] + [0.0] * (len(actions) - 1),
            "outcome": -1,
            "value": -0.7,
        }
        episode = {"completed": True, "rulesID": RULES["id"], "samples": [sample]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "episodes" / "game.json.gz"
            write_episode(path, episode)
            write_replay(path, episode)
            compact = read_episode(replay_path(path))
            self.assertNotIn("observation", compact["samples"][0])
            rows = replay_samples([compact], RULES["id"])
            policy = Policy(metadata={"version": 1, "rulesID": RULES["id"]})
            report = policy.train(rows, 3, epochs=1)
        self.assertTrue(report["updated"])
        self.assertEqual(report["samples"], 1)


if __name__ == "__main__":
    unittest.main()
