import unittest
from unittest.mock import patch

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.rules import DECKS, LIVE_DECK
from clash_bot.arena.training.evaluation import (
    evaluate,
    evaluation_setup,
    paired_gate,
    pfsp_weights,
)
from clash_bot.arena.training.selfplay import live_setup


class QualificationTest(unittest.TestCase):
    def test_late_alpha_spending_increases_the_budget_instead_of_permanently_blocking_promotion(
        self,
    ):
        challenger = Policy(seed=1, metadata={"version": 1, "rulesID": "rules-a"})
        champion = Policy(seed=2, metadata={"version": 0, "rulesID": "rules-a"})

        def game(models, *args, **kwargs):
            return {
                "completed": True,
                "rejectedCommands": 0,
                "winner": 0 if models[0] is challenger else 1,
                "samples": [],
            }

        with patch("clash_bot.arena.training.evaluation.play_game", side_effect=game):
            result = evaluate(challenger, champion, "rules-a", 10000, pairs=16)
        self.assertGreater(result["requestedPairs"], 16)
        self.assertEqual(len(result["games"]), 2 * result["requestedPairs"])
        self.assertTrue(result["gate"]["passed"])

    def test_ties_small_samples_and_nonfinite_results_cannot_promote(self):
        for scores in ([1] * 4, [0.5] * 64, [0] * 32, [float("nan")]):
            self.assertFalse(paired_gate(scores)["passed"])
        self.assertTrue(paired_gate([1] * 16)["passed"])
        self.assertGreater(pfsp_weights([0.1, 0.9])[0], pfsp_weights([0.1, 0.9])[1])

    def test_evaluation_swaps_seats_reuses_pair_seed_and_disables_training(self):
        a = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        b = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        before = (a.checksum(), b.checksum())
        game = {"completed": True, "rejectedCommands": 0, "winner": 0, "samples": []}
        with patch("clash_bot.arena.training.evaluation.play_game", return_value=game) as play:
            result = evaluate(a, b, "rules-a", 0, pairs=2)
        self.assertEqual(result["pairs"], [0.5, 0.5])
        self.assertFalse(result["gate"]["passed"])
        self.assertEqual((a.checksum(), b.checksum()), before)
        calls = play.call_args_list
        self.assertEqual(calls[0].args[1], calls[1].args[1])
        self.assertTrue(calls[0].args[1].startswith("holdout-"))
        self.assertIs(calls[0].args[0][0], a)
        self.assertIs(calls[1].args[0][1], a)
        self.assertTrue(all(call.kwargs["training"] is False for call in calls))
        # Same setup/seed within a pair; both policies control both decks, without search.
        self.assertTrue(all(call.kwargs["simulations"] == 0 for call in calls))
        self.assertEqual(calls[0].kwargs["setup"], live_setup())
        self.assertEqual(calls[2].kwargs["setup"], calls[3].kwargs["setup"])
        self.assertNotEqual(calls[2].kwargs["setup"]["decks"][1], LIVE_DECK)
        with patch(
            "clash_bot.arena.training.evaluation.play_game",
            return_value={**game, "completed": False},
        ):
            with self.assertRaisesRegex(ValueError, "Unverified"):
                evaluate(a, b, "rules-a", 0, pairs=1)

    def test_full_evaluation_includes_every_threat_deck_before_promotion(self):
        setups = [evaluation_setup(pair, 3) for pair in range(2 * (len(DECKS) - 1))]
        # Pairs differ in how far apart the two decision clocks run.
        self.assertGreater(len({row["phase"] for row in setups}), 10)
        self.assertEqual({row["decks"][1] for row in setups}, set(DECKS))
        self.assertTrue(all(row["decks"][0] == LIVE_DECK for row in setups))

    def test_mixed_matchup_wins_cannot_hide_a_live_mirror_regression(self):
        challenger = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        champion = Policy(metadata={"version": 0, "rulesID": "rules-a"})

        def game(models, identity, *args, **kwargs):
            pair = int(identity.rsplit("-", 1)[1])
            seat = 0 if models[0] is challenger else 1
            # All mixed pairs win, four mirror pairs lose, remaining mirrors tie.
            winner = seat if pair % 2 else 1 - seat if pair < 8 else 2
            return {"completed": True, "rejectedCommands": 0, "winner": winner, "samples": []}

        with patch("clash_bot.arena.training.evaluation.play_game", side_effect=game):
            result = evaluate(challenger, champion, "rules-a", 0, pairs=64)
        self.assertGreater(result["gate"]["score"], 0.55)
        self.assertLess(result["matchupStrata"]["liveMirror"]["score"], 0.5)
        self.assertFalse(result["gate"]["passed"])
        self.assertEqual(result["gate"]["reason"], "matchup_stratum_regression")

    def test_batched_pairs_keep_pair_order_and_stop_between_batches(self):
        a = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        b = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        batches = []

        def play(jobs):
            batches.append([job["identity"] for job in jobs])
            # The challenger wins both seats of even pairs and loses both of odd ones.
            return [
                [
                    {
                        "winner": seat
                        if int(job["identity"].rsplit("-", 1)[1]) % 2 == 0
                        else 1 - seat
                    }
                    for seat in (0, 1)
                ]
                for job in jobs
            ]

        result = evaluate(a, b, "rules-a", 2, pairs=5, play_pairs=play, batch=2)
        self.assertEqual(
            batches,
            [["holdout-2-0", "holdout-2-1"], ["holdout-2-2", "holdout-2-3"], ["holdout-2-4"]],
        )
        self.assertEqual(result["pairs"], [1, 0, 1, 0, 1])
        self.assertEqual([game["challengerSeat"] for game in result["games"]], [0, 1] * 5)
        stops = iter([False, True])
        result = evaluate(
            a, b, "rules-a", 2, pairs=5, play_pairs=play, batch=2, should_stop=lambda: next(stops)
        )
        self.assertEqual(result["pairs"], [1, 0])
        self.assertEqual(result["gate"]["reason"], "interrupted_evaluation")

    def test_rule_mismatch_and_interrupted_evaluation_do_not_promote(self):
        a = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        with self.assertRaisesRegex(ValueError, "another rule"):
            evaluate(a, a, "rules-b", 0)
        result = evaluate(a, a, "rules-a", 0, should_stop=lambda: True)
        self.assertFalse(result["complete"])
        self.assertEqual(result["gate"]["reason"], "interrupted_evaluation")


if __name__ == "__main__":
    unittest.main()
