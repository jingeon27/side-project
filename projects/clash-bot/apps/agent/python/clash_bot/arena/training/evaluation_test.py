import unittest
from unittest.mock import patch

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.rules import LIVE_DECK, POOL_DECKS
from clash_bot.arena.training.evaluation import (
    CONFIRMATION_PLAN,
    evaluate,
    evaluation_setup,
    paired_gate,
    pfsp_weights,
)
from clash_bot.arena.training.selfplay import live_setup


class QualificationTest(unittest.TestCase):
    def test_confirmation_threshold_does_not_shrink_with_evaluation_number(self):
        a = Policy(metadata={"version": 1, "rulesID": "rules-a"})
        b = Policy(metadata={"version": 0, "rulesID": "rules-a"})

        def play(jobs):
            return [
                (
                    [{"winner": 0}, {"winner": 1}],
                    {"winner": 2} if job["setup"]["decks"][0] != job["setup"]["decks"][1] else None,
                )
                for job in jobs
            ]

        for number in (1, 132, 10000):
            result = evaluate(
                a,
                b,
                "rules-a",
                number,
                pairs=CONFIRMATION_PLAN["pairs"],
                alpha=CONFIRMATION_PLAN["alpha"],
                play_matchups=play,
            )
            self.assertEqual(result["requestedPairs"], 128)
            self.assertEqual(result["gate"]["alpha"], 0.01)
            self.assertTrue(result["gate"]["passed"])

    def test_passing_score_still_needs_evidence_at_one_percent(self):
        self.assertTrue(paired_gate([1] * 44 + [0] * 20 + [0.5] * 64)["passed"])
        result = paired_gate([1] * 41 + [0] * 23 + [0.5] * 64)
        self.assertGreater(result["score"], 0.55)
        self.assertGreater(result["confidenceInterval"][0], 0.5)
        self.assertGreater(result["oneSidedSignTestP"], 0.01)
        self.assertFalse(result["passed"])

    def test_screening_cannot_promote_even_a_sweep(self):
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
            result = evaluate(challenger, champion, "rules-a", 10000, pairs=32)
        self.assertEqual(result["requestedPairs"], 32)
        self.assertEqual(len(result["games"]), 2 * result["requestedPairs"])
        self.assertEqual(result["gate"]["reason"], "screening_only")
        self.assertFalse(result["gate"]["passed"])
        self.assertIsNone(result["gate"]["alpha"])

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
        self.assertEqual(calls[2].args[1], calls[4].args[1])
        self.assertEqual(calls[2].kwargs["setup"], calls[4].kwargs["setup"])
        self.assertEqual(calls[4].args[0], [b, b])
        self.assertEqual(
            (len(calls), len(result["games"]), result["poolComparison"]["games"]), (5, 4, 1)
        )
        with patch(
            "clash_bot.arena.training.evaluation.play_game",
            return_value={**game, "completed": False},
        ):
            with self.assertRaisesRegex(ValueError, "Unverified"):
                evaluate(a, b, "rules-a", 0, pairs=1)

    def test_full_evaluation_includes_every_threat_deck_before_promotion(self):
        setups = [evaluation_setup(pair, 3) for pair in range(4 * len(POOL_DECKS))]
        # Pairs differ in how far apart the two decision clocks run.
        self.assertGreater(len({row["phase"] for row in setups}), 10)
        self.assertTrue(all(row["decks"] == [LIVE_DECK, LIVE_DECK] for row in setups[::2]))
        for seat in (0, 1):
            self.assertCountEqual(
                [row["decks"][seat] for row in setups[1::2] if row["decks"][1 - seat] == LIVE_DECK],
                POOL_DECKS,
            )

    def test_high_mirror_score_cannot_hide_a_loss_against_the_same_pool_deck_control(self):
        challenger = Policy(metadata={"version": 1})
        champion = Policy(metadata={"version": 0})

        def play(jobs, incumbent_wins):
            matchups = []
            for job in jobs:
                decks = job["setup"]["decks"]
                if decks[0] == decks[1]:
                    matchups.append(([{"winner": 0}, {"winner": 1}], None))
                    continue
                live = decks.index(LIVE_DECK)
                # The Graveyard side wins each scored mixed game for both incumbents below.
                matchups.append(
                    (
                        [{"winner": live}, {"winner": live}],
                        {"winner": 1 - live if incumbent_wins else live},
                    )
                )
            return matchups

        for incumbent_wins in (True, False):
            result = evaluate(
                challenger,
                champion,
                "rules",
                0,
                pairs=64,
                alpha=0.05,
                play_matchups=lambda jobs: play(jobs, incumbent_wins),
            )
            self.assertEqual((result["gate"]["score"], len(result["games"])), (0.75, 128))
            self.assertEqual(result["matchupStrata"]["mixedDeck"]["score"], 0.5)
            pool = result["poolComparison"]
            self.assertEqual(
                (pool["games"], pool["challengerScore"], pool["championScore"]),
                (32, 0, int(incumbent_wins)),
            )
            self.assertTrue(all(row["games"] for row in pool["byDeck"].values()))
            self.assertEqual(result["gate"]["passed"], not incumbent_wins)
            if incumbent_wins:
                self.assertEqual(result["gate"]["reason"], "pool_deck_regression")

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
            result = evaluate(challenger, champion, "rules-a", 0, pairs=64, alpha=0.05)
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
                (
                    [
                        {
                            "winner": seat
                            if int(job["identity"].rsplit("-", 1)[1]) % 2 == 0
                            else 1 - seat
                        }
                        for seat in (0, 1)
                    ],
                    {"winner": 2} if job["setup"]["decks"][0] != job["setup"]["decks"][1] else None,
                )
                for job in jobs
            ]

        result = evaluate(a, b, "rules-a", 2, pairs=5, play_matchups=play, batch=2)
        self.assertEqual(
            batches,
            [
                ["holdout-rules-a-2-0", "holdout-rules-a-2-1"],
                ["holdout-rules-a-2-2", "holdout-rules-a-2-3"],
                ["holdout-rules-a-2-4"],
            ],
        )
        self.assertEqual(result["pairs"], [1, 0, 1, 0, 1])
        self.assertEqual([game["challengerSeat"] for game in result["games"]], [0, 1] * 5)
        stops = iter([False, True])
        result = evaluate(
            a,
            b,
            "rules-a",
            2,
            pairs=5,
            play_matchups=play,
            batch=2,
            should_stop=lambda: next(stops),
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

    def test_a_new_rule_set_has_disjoint_holdout_worlds(self):
        identities = []
        game = {"completed": True, "rejectedCommands": 0, "winner": 0, "samples": []}
        for rules in ("rules-a", "rules-b"):
            policy = Policy(metadata={"version": 0, "rulesID": rules})
            with patch("clash_bot.arena.training.evaluation.play_game", return_value=game) as play:
                evaluate(policy, policy, rules, 0, pairs=2)
            identities.append({call.args[1] for call in play.call_args_list})
        self.assertTrue(identities[0].isdisjoint(identities[1]))


if __name__ == "__main__":
    unittest.main()
