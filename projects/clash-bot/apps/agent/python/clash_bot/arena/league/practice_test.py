import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path

from clash_bot.arena.league.champions import checkpoint, learner_history
from clash_bot.arena.league.practice import practice_history, select_goals
from clash_bot.arena.training.focus_opening import goal_decks
from clash_bot.arena.training.storage import replay_path, write_episode


class PracticeScheduleTest(unittest.TestCase):
    def test_optimizer_totals_follow_the_saved_learner_and_skip_an_unpublished_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for version, parent in ((1, 0), (2, 1), (3, 1)):
                path = checkpoint(root, version)
                path.mkdir(parents=True)
                (path / "metadata.json").write_text(
                    json.dumps({"version": version, "parent": parent, "rulesID": "r"})
                )
            history = learner_history(root, {"learner": 3, "rulesID": "r"})
            self.assertEqual([row["version"] for row in history], [3, 1])

    def test_first_round_covers_every_goal_and_spreads_forms_while_prioritizing_base_cards(self):
        pool = goal_decks()
        priorities = {"card:Archer": 2, "card:Witch": 1}
        tried, verified = Counter(), Counter()
        first = select_goals(pool, 32, tried, verified, priorities)
        self.assertEqual(
            {g.split(":")[0] for g in first}, {"card", "evolution", "hero", "champion"}
        )
        self.assertNotIn("card:Witch", first)
        self.assertNotIn("card:Archer", first)
        self.assertEqual(set(select_goals(pool, len(pool), tried, verified, priorities)), set(pool))
        verified.update(pool.keys())
        self.assertEqual(len(select_goals(pool, 56, tried, verified, priorities)), 2)

    def test_unverified_intervention_is_retried_and_last_verified_sample_survives_the_window(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            league = {"rulesID": "test", "episodes": []}
            goal = "hero:IceWizard"
            for index, ok in enumerate((False, True)):
                episode = str(root / f"train-focus-{index}.json.gz")
                write_episode(
                    replay_path(episode),
                    {
                        "completed": True,
                        "rulesID": "test",
                        "practiceTrial": {"goal": goal, "verified": ok},
                        "samples": [{"practiceGoal": goal}] if ok else [],
                    },
                )
                league["episodes"].append(episode)
                attempts, successes, latest = practice_history(root, league, persist=True)
                self.assertEqual((attempts[goal], successes[goal]), (index + 1, int(ok)))
                self.assertEqual(latest, {goal: episode} if ok else {})
            other = "card:Knight"
            self.assertEqual(select_goals([goal, other], 4, attempts, successes, {}), [other])
            league["episodes"].extend(str(root / f"train-{n}.json.gz") for n in range(260))
            self.assertEqual(practice_history(root, league)[2], {goal: episode})
            league["episodes"] = []
            self.assertEqual(practice_history(root, league)[2], {})
