import copy
import math
import unittest

from clash_bot.arena.context import decision_context
from clash_bot.arena.curriculum import scenario
from clash_bot.arena.engine import Arena
from clash_bot.arena.rules import FIELDS, TILE, Action


class PublicSpellPhaseTest(unittest.TestCase):
    def test_body_motion_uses_prior_public_positions_and_ignores_future_positions(self):
        observation = scenario(1004, 2)
        row = next(
            entity for entity in observation["state"]["entities"] if entity[FIELDS["card_id"]] >= 0
        )
        tick = observation["state"]["tick"]
        uid, x, y = row[FIELDS["uid"]], row[FIELDS["x"]], row[FIELDS["y"]]
        observation["trail"] = [[tick - 10, [[uid, x - TILE, y]]]]
        before = decision_context(observation, [])["bodies"]
        self.assertTrue(
            any(body["velocity"] == [2, 0] for bodies in before.values() for body in bodies)
        )
        observation["trail"].append([tick + 1, [[uid, 0, 0]]])
        self.assertEqual(before, decision_context(observation, [])["bodies"])

    def test_training_context_keeps_graveyard_phase_from_the_public_cast_history(self):
        observation = scenario(1004, 0)
        context = decision_context(observation, [])
        cast_tick = observation["history"][-1]["tick"]
        expected = math.floor((observation["state"]["tick"] - cast_tick) / 20 + 0.5)
        self.assertEqual(context["effects"][0][:2], ["red", "graveyard"])
        self.assertEqual(context["effects"][0][4], expected)
        self.assertGreater(expected, 0)

    def test_enemy_return_count_uses_public_plays_and_ignores_future_actions(self):
        observation = scenario(1004, 0)
        self.assertIn(["graveyard", 4, 4], decision_context(observation, [])["enemyCycle"])
        future = copy.deepcopy(observation)
        future["history"].append(
            {
                "tick": future["state"]["tick"] + 1,
                "plays": [{"team": 1, "action": [6, 0, 0], "cost": 4}],
            }
        )
        self.assertEqual(
            decision_context(future, [])["enemyCycle"],
            decision_context(observation, [])["enemyCycle"],
        )

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


class ScreenNamesTest(unittest.TestCase):
    def test_simulated_furnace_and_hero_ability_read_as_the_screen_names_them(self):
        deck = [4, 1, 5, 6, 0, 2, 3, 7]
        arena = Arena(1, [deck, deck])
        arena.play([Action(-1)] * 2, 100)
        arena.play([Action(1, 6 * TILE, 5 * TILE), Action(-1)], 1)
        arena.play([Action(4, 12 * TILE, 6 * TILE), Action(-1)], 60)
        context = decision_context(arena.observe(0), [Action(-1), Action(-2)])
        # The engine's Furnace record (Furnace_rework) used to read as an unknown "?" body.
        self.assertIn("furnace", [row[0] for row in context["own"]])
        self.assertNotIn("?", [row[0] for row in context["own"]])
        self.assertEqual(context["actions"][1][1:4], ["ability", "ice_wizard", 2])


if __name__ == "__main__":
    unittest.main()
