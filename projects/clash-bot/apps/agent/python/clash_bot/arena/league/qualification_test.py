import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from clash_bot.arena.league.champions import initialize
from clash_bot.arena.league.qualification import promising, qualify
from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.rules import rules_identity


def screening_result(score):
    return {
        "complete": True,
        "gate": {"passed": False, "reason": "screening_only", "score": score},
        "games": [],
        "matchupStrata": {"liveMirror": {"score": score}, "mixedDeck": {"score": score}},
        "poolComparison": {"nonRegressing": True},
    }


class NoPlayPromotionTest(unittest.TestCase):
    def test_promising_score_uses_an_independent_fixed_challenger_before_publishing(self):
        rules = rules_identity()
        audit = {"complete": True, "passed": True, "tested": True, "games": []}

        self.assertFalse(
            promising(
                {
                    **screening_result(0.59),
                    "openingAudit": audit,
                    "poolComparison": {"nonRegressing": False},
                }
            )
        )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            league = initialize(root, rules)
            learner = Policy.load(root / "checkpoints/v000000", rules["id"])
            learner.save(root / "checkpoints/v000001", {"version": 1})
            league["learner"] = 1
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: False)
            with (
                patch(
                    "clash_bot.arena.league.qualification.evaluate",
                    side_effect=[screening_result(0.59), screening_result(0.48)],
                ) as play,
                patch("clash_bot.arena.league.qualification.opening_audit", return_value=audit),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, SimpleNamespace(count=1), root, league, rules, learner, 32)
            self.assertEqual([call.args[3] for call in play.call_args_list], [0, 1])
            self.assertEqual([call.kwargs["pairs"] for call in play.call_args_list], [32, 128])
            self.assertEqual(
                [call.kwargs["alpha"] for call in play.call_args_list],
                [None, 0.01],
            )
            self.assertEqual(
                play.call_args_list[0].args[0].checksum(), play.call_args_list[1].args[0].checksum()
            )
            self.assertIs(play.call_args_list[0].args[1], play.call_args_list[1].args[1])
            publish.assert_not_called()
            self.assertEqual((league["evaluations"], league["champion"]), (2, 0))
            second = json.loads((root / "evaluations/v000001-e000001.json").read_text())
            self.assertEqual(second["confirmationOf"], 0)
            self.assertEqual(second["gate"]["score"], 0.48)

            passed = screening_result(0.64)
            passed["gate"].update(passed=True, reason="qualified")
            learner = Policy(seed=31, metadata={"version": 2, "rulesID": rules["id"]})
            learner.save(root / "checkpoints/v000002", {})
            league["learner"] = 2
            with (
                patch(
                    "clash_bot.arena.league.qualification.evaluate",
                    side_effect=[screening_result(0.57), passed],
                ),
                patch("clash_bot.arena.league.qualification.opening_audit", return_value=audit),
                patch(
                    "clash_bot.arena.league.qualification.benchmark", return_value={"opponents": {}}
                ),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, SimpleNamespace(count=1), root, league, rules, learner, 32)
            publish.assert_called_once()
            self.assertEqual((league["evaluations"], league["champion"]), (4, 2))
            confirmed = json.loads((root / "evaluations/v000002-e000003.json").read_text())
            self.assertEqual(confirmed["confirmationOf"], 2)
            self.assertTrue(confirmed["gate"]["passed"])

    def test_only_a_candidate_passing_both_gates_enters_the_teacher_opponent_pool(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rules = rules_identity()
            league = initialize(root, rules)
            policy = Policy.load(root / "checkpoints/v000000", rules["id"])
            policy.save(root / "checkpoints/v000001", {"version": 1})
            league["learner"] = 1
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: False)
            workers = SimpleNamespace(count=2)
            result = {"complete": True, "gate": {"passed": True}, "games": []}
            audit = {"tested": True, "complete": True, "passed": True, "games": []}
            with (
                patch("clash_bot.arena.league.qualification.evaluate", return_value=result),
                patch("clash_bot.arena.league.qualification.opening_audit", return_value=audit),
                patch(
                    "clash_bot.arena.league.qualification.benchmark", return_value={"opponents": {}}
                ),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, workers, root, league, rules, policy, None)
            self.assertEqual(league["champion"], 1)
            self.assertEqual([row["version"] for row in league["opponents"]], [0, 1])
            saved = json.loads((root / "league.json").read_text())
            self.assertEqual(saved["opponents"], league["opponents"])
            publish.assert_called_once()

    def test_stop_after_the_win_test_cannot_skip_opening_check_and_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rules = rules_identity()
            league = initialize(root, rules)
            policy = Policy.load(root / "checkpoints/v000000", rules["id"])
            policy.save(root / "checkpoints/v000001", {"version": 1})
            league["learner"] = 1
            stops = iter([False, True])
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: next(stops))
            workers = SimpleNamespace(count=2)
            result = {"complete": True, "gate": {"passed": True}, "games": []}
            with (
                patch("clash_bot.arena.league.qualification.evaluate", return_value=result),
                patch(
                    "clash_bot.arena.league.qualification.benchmark", return_value={"opponents": {}}
                ),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, workers, root, league, rules, policy, None)
            publish.assert_not_called()
            self.assertEqual(league["champion"], 0)
            self.assertEqual([row["version"] for row in league["opponents"]], [0])
            recorded = json.loads((root / "evaluations/v000001-e000000.json").read_text())
            self.assertFalse(recorded["gate"]["passed"])
            self.assertEqual(recorded["gate"]["reason"], "interrupted_opening_audit")
            self.assertFalse(recorded["openingAudit"]["complete"])

    def test_a_statistical_win_cannot_promote_a_self_deadlocking_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rules = rules_identity()
            league = initialize(root, rules)
            policy = Policy.load(root / "checkpoints/v000000", rules["id"])
            policy.save(root / "checkpoints/v000001", {"version": 1})
            league["learner"] = 1
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: False)
            workers = SimpleNamespace(count=2)
            result = {"complete": True, "gate": {"passed": True}, "games": []}
            audit = {
                "tested": True,
                "complete": True,
                "passed": False,
                "noPlayGames": 4,
                "games": [],
            }
            with (
                patch("clash_bot.arena.league.qualification.evaluate", return_value=result),
                patch("clash_bot.arena.league.qualification.opening_audit", return_value=audit),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, workers, root, league, rules, policy, None)
            publish.assert_not_called()
            self.assertEqual(league["champion"], 0)
            self.assertEqual([row["version"] for row in league["opponents"]], [0])
            recorded = json.loads((root / "evaluations/v000001-e000000.json").read_text())
            self.assertFalse(recorded["gate"]["passed"])
            self.assertEqual(recorded["gate"]["reason"], "self_opening_deadlock")
            self.assertEqual(league["evaluations"], 1)

    def test_a_losing_candidate_is_also_checked_for_recurring_deadlock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rules = rules_identity()
            league = initialize(root, rules)
            policy = Policy.load(root / "checkpoints/v000000", rules["id"])
            policy.save(root / "checkpoints/v000001", {"version": 1})
            league["learner"] = 1
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: False)
            workers = SimpleNamespace(count=2)
            result = {
                "complete": True,
                "gate": {"passed": False, "reason": "screening_only"},
                "games": [],
            }
            audit = {
                "tested": True,
                "complete": True,
                "passed": False,
                "noPlayGames": 4,
                "games": [],
            }
            with (
                patch("clash_bot.arena.league.qualification.evaluate", return_value=result),
                patch(
                    "clash_bot.arena.league.qualification.opening_audit", return_value=audit
                ) as check,
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, workers, root, league, rules, policy, 22)
            check.assert_called_once()
            publish.assert_not_called()
            recorded = json.loads((root / "evaluations/v000001-e000000.json").read_text())
            self.assertEqual(recorded["openingAudit"]["noPlayGames"], 4)
            self.assertEqual(recorded["gate"]["reason"], "screening_only")
            self.assertEqual(league["champion"], 0)
            self.assertEqual([row["version"] for row in league["opponents"]], [0])

    def test_interruption_and_duplicate_weights_reuse_the_reserved_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rules = rules_identity()
            league = initialize(root, rules)
            learner = Policy(seed=42, metadata={"version": 1, "rulesID": rules["id"]})
            learner.save(root / "checkpoints/v000001", {})
            league["learner"] = 1
            played = []

            def play(_worker, jobs):
                played.extend(job["identity"] for job in jobs)
                return [
                    (
                        [{"winner": 0}, {"winner": 0}],
                        {"winner": 0}
                        if job["setup"]["decks"][0] != job["setup"]["decks"][1]
                        else None,
                    )
                    for job in jobs
                ]

            workers = SimpleNamespace(count=2, map=play)
            stops = iter([False, False, True])
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: next(stops))
            partial = qualify(control, workers, root, league, rules, learner, pairs=None)
            self.assertFalse(partial["complete"])
            original_seeds = played.copy()
            self.assertEqual(len(original_seeds), 2)
            duplicate = Policy(
                weights=learner.weights, metadata={"version": 2, "rulesID": rules["id"]}
            )
            duplicate.save(root / "checkpoints/v000002", {})
            league["learner"] = 2
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: False)
            played.clear()
            audit = {"complete": True, "passed": True, "tested": True, "games": []}
            with patch("clash_bot.arena.league.qualification.opening_audit", return_value=audit):
                complete = qualify(control, workers, root, league, rules, duplicate, pairs=None)
                self.assertTrue(complete["complete"])
                self.assertFalse(complete["gate"]["passed"])
                self.assertEqual(complete["challenger"]["version"], 1)
                self.assertEqual(played[:2], original_seeds)
                self.assertEqual(len(set(played)), 128)
                played.clear()
                self.assertEqual(
                    qualify(control, workers, root, league, rules, duplicate, pairs=None), complete
                )
                self.assertEqual(played, [])
                self.assertEqual(league["evaluations"], 1)
                self.assertEqual(league["champion"], 0)


if __name__ == "__main__":
    unittest.main()
