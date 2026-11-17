"""A failed public hypothesis cannot create targets or stop the authoritative game."""

import unittest
from unittest.mock import patch

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.belief import PublicRootMismatch
from clash_bot.arena.training.search import search
from clash_bot.arena.training.selfplay import live_setup, play_game

SEARCH = "clash_bot.arena.training.selfplay.search"


class ReconstructionRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.policy = Policy(metadata={"version": 0, "rulesID": "test-recovery"})

    def play(self):
        return play_game(
            [self.policy, self.policy],
            "reconstruction-recovery",
            "test-recovery",
            simulations=2,
            depth=2,
            setup=live_setup(1),
        )

    def test_each_seat_finishes_with_frozen_policy_without_retries_or_expert_targets(self):
        before = self.policy.checksum()
        with patch(SEARCH, side_effect=PublicRootMismatch("evidence: public-board.json")) as call:
            game = self.play()
        self.assertTrue(game["completed"])
        self.assertEqual(game["rejectedCommands"], 0)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(game["samples"], [])
        self.assertEqual(game["searchSimulations"], 0)
        self.assertEqual(sum(game["policyOnlyDecisions"]), game["decisions"])
        self.assertTrue(all(count > 0 for count in game["policyOnlyDecisions"]))
        self.assertEqual(
            game["searchUnavailable"],
            [
                {"tick": args.args[0]["state"]["tick"], "evidence": "evidence: public-board.json"}
                for args in call.call_args_list
            ],
        )
        self.assertEqual(self.policy.checksum(), before)

    def test_valid_earlier_searches_keep_the_real_terminal_result_and_no_later_targets(self):
        def fail_later(observation, *args, **kwargs):
            if observation["state"]["tick"] >= 200:
                raise PublicRootMismatch("evidence: later-board.json")
            return search(observation, *args, **kwargs)

        with patch(SEARCH, side_effect=fail_later):
            game = self.play()
        self.assertTrue(game["completed"])
        self.assertEqual(game["rejectedCommands"], 0)
        self.assertGreater(len(game["samples"]), 0)
        self.assertGreater(game["searchSimulations"], 0)
        for sample in game["samples"]:
            stopped = game["searchUnavailable"][sample["team"]]
            self.assertLess(sample["observation"]["state"]["tick"], stopped["tick"])
            outcome = 0 if game["winner"] == 2 else 1 if game["winner"] == sample["team"] else -1
            self.assertEqual(sample["outcome"], outcome)
            self.assertIsNotNone(sample["value"])
        self.assertTrue(all(count > 0 for count in game["policyOnlyDecisions"]))

    def test_other_search_errors_remain_fatal(self):
        with patch(SEARCH, side_effect=ValueError("invalid policy")):
            with self.assertRaisesRegex(ValueError, "invalid policy"):
                self.play()


if __name__ == "__main__":
    unittest.main()
