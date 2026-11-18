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
