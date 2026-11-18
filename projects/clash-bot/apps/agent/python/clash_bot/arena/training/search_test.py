import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from clash_bot.arena.policy.network import Policy, features
from clash_bot.arena.sim.belief import PublicRootMismatch
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import DECKS, Action, deck_ids
from clash_bot.arena.training.search import Workspace, search


class PublicSearchTest(unittest.TestCase):
    def test_simulations_keep_the_frozen_opponents_response_even_after_value_backups(self):
        class WaitingOpponent:
            def predict(self, _observation, actions):
                return np.array([float(action == Action(-1)) for action in actions]), 0.0

        world, workspace = Arena(1), Workspace()
        world.play([Action(-1)] * 2, 100)
        with patch.object(workspace.scratch, "play", wraps=workspace.scratch.play) as played:
            result = search(
                world.observe(0),
                Policy(),
                91,
                simulations=24,
                depth=3,
                opponent_policy=WaitingOpponent(),
                workspace=workspace,
            )
        self.assertEqual(result["opponentResponse"], "frozen_card_policy")
        self.assertEqual(result["simulations"], 24)
        self.assertEqual(sum(call.args[1] for call in played.call_args_list), 24 * 100)
        self.assertTrue(all(call.args[0][1] == Action(-1) for call in played.call_args_list))

    def test_a_failed_reconstruction_preserves_public_evidence_without_inventing_a_world(self):
        observation = Arena(1).observe(0)
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("clash_bot.arena.training.search.DATA_DIR", Path(directory)),
            patch(
                "clash_bot.arena.training.search.BeliefSampler.conditioned",
                side_effect=PublicRootMismatch("incompatible"),
            ),
        ):
            with self.assertRaisesRegex(PublicRootMismatch, "evidence"):
                search(observation, Policy(), 12)
            path = next((Path(directory) / "arena/reconstruction-failures").glob("*.json"))
            recorded = json.loads(path.read_text())
        self.assertEqual(recorded["observation"]["decks"], ["counterpush", None])
        self.assertNotIn("hand", recorded["observation"]["state"]["players"][1])
        self.assertIsNone(recorded["lastReconstructedBoard"])

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
        self.assertEqual(a["maxLookaheadSeconds"], 7)
        self.assertEqual(a["reconstruction"], "public_board_exact")
        self.assertEqual(a["deckHypotheses"], [1, len(DECKS)])
        self.assertTrue(
            set(a["actions"]).issubset({Action(*row) for row in first.observe(0)["legalActions"]})
        )

    def test_changing_unrevealed_enemy_deck_cannot_change_the_observation_or_search(self):
        own = deck_ids("counterpush")
        worlds = [
            Arena(1, [own, deck_ids(enemy)], ["counterpush", enemy])
            for enemy in ("drill_control", "lava_balloon")
        ]
        for world in worlds:
            world.play([Action(-1)] * 2, 100)
        self.assertEqual(worlds[0].observe(0), worlds[1].observe(0))
        policy, workspace = Policy(), Workspace()
        results = [
            search(world.observe(0), policy, 57, simulations=4, depth=2, workspace=workspace)
            for world in worlds
        ]
        self.assertEqual(results[0]["actions"], results[1]["actions"])
        np.testing.assert_array_equal(results[0]["target"], results[1]["target"])

    def test_kept_hypotheses_continue_between_decisions_without_reading_the_hidden_hand(self):
        own = list(range(8))
        games = [Arena(1, [own, own], delays=(22, 18)), Arena(9, [own, own[::-1]], delays=(22, 18))]
        policy, workspace = Policy(), Workspace()
        beliefs = [[None, None], [None, None]]
        for game in games:
            game.play([Action(-1)] * 2, 100)
        self.assertNotEqual(
            games[0].state()["players"][1]["hand"], games[1].state()["players"][1]["hand"]
        )
        for step in range(4):
            results = [
                search(
                    game.observe(0),
                    policy,
                    40 + step,
                    simulations=4,
                    depth=2,
                    workspace=workspace,
                    beliefs=kept,
                )
                for game, kept in zip(games, beliefs)
            ]
            self.assertEqual(results[0]["actions"], results[1]["actions"])
            np.testing.assert_array_equal(results[0]["target"], results[1]["target"])
            for result in results:
                continued, sampled = (
                    result["continuedHypotheses"],
                    result["rootConditioningAttempts"],
                )
                # Nothing new is public at the second decision; later our own draw may end one.
                self.assertEqual(
                    (continued, sampled),
                    {0: (0, 2), 1: (2, 0)}.get(step, (continued, 2 - continued)),
                )
            move = results[0]["actions"][int(np.argmax(results[0]["target"]))]
            for game in games:
                game.play([move if step == 1 else Action(-1), Action(-1)], 20)


if __name__ == "__main__":
    unittest.main()
