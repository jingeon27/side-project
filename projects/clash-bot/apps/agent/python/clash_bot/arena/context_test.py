import copy
import math
import unittest

from clash_bot.arena.context import decision_context
from clash_bot.arena.curriculum import scenario


class PublicSpellPhaseTest(unittest.TestCase):
    def test_training_context_keeps_graveyard_phase_from_the_public_cast_history(self):
        observation = scenario(1004, 0)
        context = decision_context(observation, [])
        cast_tick = observation["history"][-1]["tick"]
        expected = math.floor((observation["state"]["tick"] - cast_tick) / 20 + 0.5)
        self.assertEqual(context["effects"][0][:2], ["red", "graveyard"])
        self.assertEqual(context["effects"][0][4], expected)
        self.assertGreater(expected, 0)

    def test_missing_future_or_overlapping_casts_do_not_fabricate_a_phase(self):
        observation = scenario(1004, 0)
        missing = {**observation, "history": []}
        self.assertIsNone(decision_context(missing, [])["effects"][0][4])
        future = copy.deepcopy(observation)
        future["history"][0]["tick"] = observation["state"]["tick"] + 20
        self.assertIsNone(decision_context(future, [])["effects"][0][4])
        overlapping = copy.deepcopy(observation)
        overlapping["state"]["spells"].append(observation["state"]["spells"][0].copy())
        self.assertTrue(all(row[4] is None for row in decision_context(overlapping, [])["effects"]))


if __name__ == "__main__":
    unittest.main()
