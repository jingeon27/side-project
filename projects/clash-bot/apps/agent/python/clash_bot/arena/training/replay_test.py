import unittest

from clash_bot.arena.sim.rules import CARD_ID
from clash_bot.arena.training.replay import replay_coverage, replay_samples


class ReplayCoverageTest(unittest.TestCase):
    def test_rare_cards_and_matched_defenses_survive_a_bounded_replay(self):
        def row(number, card, pairs=()):
            return {
                "id": number,
                "actions": [[card, 0, 0]],
                "targetWithoutTowers": [1],
                "defensePairs": pairs,
                "attackPairs": [],
                "outcome": 0,
            }

        frequent = [row(n, CARD_ID["BarbLog"]) for n in range(400)]
        rare = row(400, CARD_ID["Golem"])
        defensive = row(401, CARD_ID["BarbLog"], [(2, 3)])
        samples = frequent + [rare, defensive]
        stale = {"completed": True, "rulesID": "old", "samples": [row(999, CARD_ID["Pekka"])]}
        episode = {"completed": True, "rulesID": "current", "samples": samples}
        selected = replay_samples([stale, episode], "current", max_samples=32, seed=79)
        self.assertEqual(len({sample["id"] for sample in selected}), 32)
        self.assertIn(rare, selected)
        self.assertIn(defensive, selected)
        coverage = replay_coverage(selected)
        self.assertEqual(coverage["cardsWithTarget"]["Golem"], 1)
        self.assertIn("Pekka", coverage["missingCards"])
        self.assertEqual(coverage["defensePairs"], 1)

    def test_skill_owners_keep_separate_seats_in_the_optimizer_batch(self):
        def row(goal):
            return {
                "actions": [[-2, 0, 0]],
                "targetWithoutTowers": [1],
                "defensePairs": [],
                "attackPairs": [],
                "outcome": 1,
                "practiceGoal": goal,
            }

        goals = ["hero:IceWizard", "hero:Knight", "champion:GoldenKnight"]
        episode = {
            "completed": True,
            "rulesID": "rules",
            "samples": [row(goals[0]) for _ in range(50)] + [row(g) for g in goals[1:]],
        }
        selected = replay_samples([episode], "rules", max_samples=3, seed=1)
        self.assertEqual(replay_coverage(selected)["practiceGoals"], dict.fromkeys(goals, 1))
