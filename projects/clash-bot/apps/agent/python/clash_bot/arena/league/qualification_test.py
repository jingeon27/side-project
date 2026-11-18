import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from clash_bot.arena.league.champions import initialize
from clash_bot.arena.league.qualification import qualify
from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.rules import rules_identity


class NoPlayPromotionTest(unittest.TestCase):
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
                qualify(control, workers, root, league, rules, policy, 22)
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
            control = SimpleNamespace(report=lambda row: None, stopped=lambda: True)
            workers = SimpleNamespace(count=2)
            result = {"complete": True, "gate": {"passed": True}, "games": []}
            with (
                patch("clash_bot.arena.league.qualification.evaluate", return_value=result),
                patch(
                    "clash_bot.arena.league.qualification.benchmark", return_value={"opponents": {}}
                ),
                patch("clash_bot.arena.league.qualification.publish_champion") as publish,
            ):
                qualify(control, workers, root, league, rules, policy, 22)
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
                qualify(control, workers, root, league, rules, policy, 22)
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
                "gate": {"passed": False, "reason": "insufficient_evidence_of_improvement"},
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
            self.assertEqual(recorded["gate"]["reason"], "insufficient_evidence_of_improvement")
            self.assertEqual(league["champion"], 0)
            self.assertEqual([row["version"] for row in league["opponents"]], [0])


if __name__ == "__main__":
    unittest.main()
