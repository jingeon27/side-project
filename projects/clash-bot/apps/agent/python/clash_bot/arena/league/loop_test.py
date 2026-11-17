"""A league publishes its champion's live policy, starts from the previous rules' champion and
resumes only the current league.json."""

import json
import signal
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from clash_bot.arena.catalogue import current
from clash_bot.arena.league.champions import (
    checkpoint,
    export_policy,
    initialize,
    publish_champion,
)
from clash_bot.arena.league.loop import run
from clash_bot.arena.policy.dense import DenseActions
from clash_bot.arena.policy.features import checksum
from clash_bot.arena.policy.network import LEAGUE_KEY, Policy, features
from clash_bot.arena.policy.samples import SparseFeatures
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.selfplay import replay_samples
from clash_bot.arena.training.storage import read_episode, replay_path, write_episode, write_replay

CATALOGUE = current().id
RULES = {"id": "r" * 64, "catalogue": CATALOGUE}


class LeagueTest(unittest.TestCase):
    def test_failure_after_initialization_restores_signals_and_preserves_the_original_error(self):
        handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("clash_bot.arena.league.loop.verify", return_value={"passed": True}),
            patch(
                "clash_bot.arena.training.parallel.Workers.map",
                side_effect=ValueError("root mismatch"),
            ),
        ):
            with self.assertRaisesRegex(ValueError, "root mismatch"):
                run(directory, hours=0, generations=1, games=1, workers=1)
            status = json.loads((Path(directory) / "arena/control/status.json").read_text())
        self.assertEqual({sig: signal.getsignal(sig) for sig in handlers}, handlers)
        self.assertEqual((status["phase"], status["error"]), ("failed", "root mismatch"))

    def test_a_failed_verification_blocks_training_before_any_league_is_initialized(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("clash_bot.arena.league.loop.verify", return_value={"passed": False}),
            patch("clash_bot.arena.league.loop.initialize") as initialize,
        ):
            with self.assertRaisesRegex(ValueError, "verification failed"):
                run(directory, hours=0, generations=1, games=1, workers=1)
        initialize.assert_not_called()

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

    def test_a_new_rule_set_starts_from_the_previous_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path(directory) / f"old-{LEAGUE_KEY}"
            old = {"id": "o" * 64, "catalogue": CATALOGUE}
            league = initialize(previous, old)
            champion = Policy(seed=9, metadata={"version": 1, "rulesID": old["id"]})
            champion.save(checkpoint(previous, 1), {"role": "qualified_champion"})
            (previous / "league.json").write_text(json.dumps({**league, "champion": 1}))

            root = Path(directory) / f"new-{LEAGUE_KEY}"
            started = initialize(root, RULES, parent=previous)
            self.assertEqual((started["learner"], started["champion"]), (0, 0))
            self.assertEqual(started["episodes"], [])  # No game of the old rules comes along.
            start = Policy.load(checkpoint(root, 0), RULES["id"])
            self.assertEqual(start.checksum(), champion.checksum())
            self.assertEqual(start.metadata["role"], "inherited_champion")
            self.assertEqual(
                start.metadata["inheritedFrom"],
                {"rulesID": old["id"], "version": 1, "weightsSHA256": champion.checksum()},
            )
            live = json.loads((root / "champion-policy.json").read_text())
            self.assertEqual((live["rulesID"], live["version"]), (RULES["id"], 0))
            self.assertEqual(live["weightsSHA256"], champion.checksum())

    def test_a_league_of_another_policy_format_is_not_inherited(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = Path(directory) / "old-fast1"
            initialize(previous, {"id": "o" * 64, "catalogue": CATALOGUE})
            root = Path(directory) / f"new-{LEAGUE_KEY}"
            initialize(root, RULES, parent=previous)
            start = Policy.load(checkpoint(root, 0), RULES["id"])
            self.assertEqual(start.metadata["role"], "initial_random_policy")
            self.assertNotIn("inheritedFrom", start.metadata)

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
            "actionBias": [0.0] * len(actions),
            "actionBiasWithoutTowers": [0.0] * len(actions),
            "source": DenseActions.pack(
                action_vectors,
                [a.card for a in actions],
                [0.0] * len(actions),
                [0.0] * len(actions),
                list(range(len(actions))),
            ).model_dump(),
            "target": [1.0] + [0.0] * (len(actions) - 1),
            "targetWithoutTowers": [1.0] + [0.0] * (len(actions) - 1),
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
