import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from clash_bot.arena.study.curriculum import from_selfplay, scenario, write_batches
from clash_bot.arena.study.teacher import Teacher
from clash_bot.qwen.records.search_data import load_search_targets


class TacticalCurriculumTest(unittest.TestCase):
    def test_an_unavailable_focus_card_is_not_recorded_as_a_card_opportunity(self):
        sample = {"observation": {"team": 0, "state": {"tick": 100}}}
        positions = [{"gameID": "before", "sample": sample, "focusCard": 3, "stage": 0}]
        episode = {"gameID": "before", "samples": [], "rulesID": "rules"}
        with (
            patch("clash_bot.arena.study.curriculum.balanced_positions", return_value=positions),
            patch("clash_bot.arena.study.curriculum.Teacher") as teacher,
            patch("clash_bot.arena.study.curriculum.write_batches") as write,
        ):
            teacher.return_value.label.return_value = {"actions": [[-1, 0, 0]]}
            self.assertEqual(from_selfplay("unused", [episode], count=1), [])
            write.assert_not_called()

    def test_mixed_deck_positions_reach_the_teacher_only_for_our_live_deck_seat(self):
        ours = {"observation": {"team": 0, "decks": ["counterpush", None]}}
        enemy = {"observation": {"team": 1, "decks": [None, "drill_control"]}}
        game = {"gameID": "mixed", "rulesID": "rules", "samples": [ours, enemy]}
        with (
            patch("clash_bot.arena.study.curriculum.balanced_positions", return_value=[]) as choose,
            patch("clash_bot.arena.study.curriculum.Teacher"),
        ):
            self.assertEqual(from_selfplay("unused", [game]), [])
        self.assertEqual(choose.call_args.args[0][0]["samples"], [ours])

    def test_ready_skill_and_hut_can_lose_to_waiting_when_the_rollout_finds_no_tower_benefit(self):
        teacher = Teacher()
        observed = scenario(1004, 4)
        before = json.dumps(observed, sort_keys=True)
        label = teacher.label(observed, "test-save-skill-and-hut", "scenario-4")
        self.assertIsNotNone(label)
        self.assertEqual(json.dumps(observed, sort_keys=True), before)
        cards = [action[0] for action in label["actions"]]
        self.assertIn(-2, cards)
        self.assertIn(2, cards)
        self.assertEqual(label["evidence"]["kind"], "paired_elixir_conservation_rollout")
        self.assertEqual(label["evidence"]["futureEnemyDeployments"], 0)
        self.assertGreater(label["target"][cards.index(-1)], 0)
        self.assertEqual(label["target"][cards.index(-2)], 0)
        self.assertTrue(all(p == 0 for card, p in zip(cards, label["target"]) if card == 2))
        with tempfile.TemporaryDirectory() as directory:
            path = write_batches(directory, [label], label["rulesID"])[0]
            self.assertEqual(load_search_targets(path)[0]["samples"][0]["target"], label["target"])

    def test_low_mana_ready_skill_is_compared_with_saving_for_a_defender(self):
        teacher = Teacher()
        observed = scenario(1005, 5)
        label = teacher.label(observed, "test-low-mana-skill", "scenario-5")
        self.assertIsNotNone(label)
        cards = [action[0] for action in label["actions"]]
        self.assertEqual(set(cards), {-1, -2})
        self.assertEqual(label["target"][cards.index(-1)], 1)
        self.assertEqual(label["target"][cards.index(-2)], 0)

    def test_measured_defense_preserves_the_root_and_is_not_a_fake_match_win(self):
        teacher = Teacher()
        observed = scenario(1004, 0)
        before = json.dumps(observed, sort_keys=True)
        label = teacher.label(observed, "test-gy-defense", "scenario-0")
        self.assertIsNotNone(label)
        self.assertEqual(json.dumps(observed, sort_keys=True), before)
        evidence = label["evidence"]
        self.assertEqual(evidence["objective"], "own_tower_preservation")
        self.assertEqual(evidence["futureEnemyDeployments"], 0)
        self.assertGreaterEqual(evidence["bestImprovement"], 80)
        self.assertNotIn("terminalOutcome", label)
        for gain, probability in zip(evidence["towerImprovement"], label["target"]):
            if probability:
                self.assertGreaterEqual(gain, evidence["bestImprovement"] - 35)
        repeated = teacher.label(observed, "test-gy-defense", "scenario-0")
        np.testing.assert_allclose(repeated["target"], label["target"])
        shuffled = teacher.label(observed, "different-id", "scenario-0")
        self.assertNotEqual(shuffled["actions"], label["actions"])
        with tempfile.TemporaryDirectory() as directory:
            train = write_batches(directory, [label], label["rulesID"])
            held = write_batches(directory, [label], label["rulesID"], split="holdout")
            self.assertNotEqual(train, held)
            self.assertEqual(json.loads(Path(held[0]).read_text())["split"], "holdout")


if __name__ == "__main__":
    unittest.main()
