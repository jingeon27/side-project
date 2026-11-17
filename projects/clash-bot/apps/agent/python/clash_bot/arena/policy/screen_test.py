"""The simulator's screen reports what the live runtime reports, not what the engine knows."""

import unittest

import numpy as np

from clash_bot.arena.policy.context import cycle_rows, decision_context
from clash_bot.arena.policy.features import CATALOGUE, TOWERS_KNOWN, context_features
from clash_bot.arena.policy.noise import PerceptionNoise
from clash_bot.arena.policy.screen import Screen
from clash_bot.arena.sim.candidates import legal_actions
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import FIELDS, Action


def noise(play_miss):
    return PerceptionNoise(
        missRate=0,
        unknownRate=0,
        jitterTiles=0,
        motionSeenRate=1,
        healthSeenRate=1,
        effectMissRate=0,
        playMissRate=play_miss,
    )


def played(arena, steps=14):
    """Both sides play their first affordable card every third second.

    Yields our observation with the context read by a screen that recognizes every opponent
    play (key 0) and one that recognizes none (key 1).
    """
    screens = {rate: Screen(noise(rate), np.random.default_rng(3)) for rate in (0, 1)}
    for step in range(steps):
        moves = [
            next((move for move in legal_actions(arena.battle, team) if move.card >= 0), Action(-1))
            if step % 3 == team
            else Action(-1)
            for team in (0, 1)
        ]
        arena.play(moves, 20)
        observation = arena.observe(0)
        yield observation, {rate: screen.read(observation, []) for rate, screen in screens.items()}


class LiveElixirBoundTest(unittest.TestCase):
    def test_a_screen_bounds_the_real_elixir_from_above_and_gives_no_lower_bound(self):
        arena = Arena(7, delays=(22, 18))
        for _observation, contexts in played(arena):
            real = arena.state()["players"][1]["elixir_milli"] / 1000
            for context in contexts.values():
                self.assertEqual(context["enemyElixir"]["min"], 0)
            # Every play recognized: above the real balance by the reading margin, not far above.
            self.assertGreaterEqual(contexts[0]["enemyElixir"]["max"] + 1e-9, min(10, real))
            self.assertLessEqual(contexts[0]["enemyElixir"]["max"], min(10, real) + 0.75)
            # No play recognized: the opponent's spending never lowers the bound.
            self.assertGreaterEqual(
                contexts[1]["enemyElixir"]["max"] + 1e-9, contexts[0]["enemyElixir"]["max"]
            )
        self.assertTrue(
            any(play["team"] == 1 for event in arena.history for play in event["plays"])
        )
        self.assertGreater(contexts[1]["enemyElixir"]["max"], contexts[0]["enemyElixir"]["max"] + 1)

    def test_the_context_without_a_screen_is_the_bound_with_every_play_recognized(self):
        arena = Arena(7)
        arena.play([Action(-1)] * 2, 200)
        observation = arena.observe(0)
        real = arena.state()["players"][1]["elixir_milli"] / 1000
        bound = decision_context(observation, [])["enemyElixir"]
        self.assertEqual(bound["min"], 0)
        self.assertAlmostEqual(bound["max"], min(10, real + 0.2), delta=0.06)


class LiveCardCycleTest(unittest.TestCase):
    def test_only_the_latest_recognized_card_is_known_to_be_four_plays_away(self):
        self.assertEqual(cycle_rows([]), [])
        rows = cycle_rows([2, 5, 2, 7])
        self.assertEqual([row[1:] for row in rows], [[0, 3], [0, 3], [4, 4]])
        self.assertEqual(len({row[0] for row in rows}), 3)
        self.assertEqual(rows[-1][0], cycle_rows([7])[0][0])

    def test_an_unrecognized_play_is_missing_from_the_cycle_and_the_towers_can_be_left_out(self):
        arena = Arena(7, delays=(22, 18))
        observation, contexts = list(played(arena))[-1]
        public = decision_context(observation, [])
        self.assertTrue(public["enemyCycle"])
        self.assertEqual(contexts[0]["enemyCycle"], public["enemyCycle"])
        self.assertEqual(contexts[1]["enemyCycle"], [])
        self.assertEqual(context_features(contexts[0])[TOWERS_KNOWN], 1)
        live = Screen(noise(0), np.random.default_rng(1)).read(observation, [], towers=False)
        self.assertNotIn("towers", live)
        self.assertEqual(context_features(live)[TOWERS_KNOWN], 0)


class HealthBarTest(unittest.TestCase):
    def test_full_health_reads_the_same_at_every_level_and_damage_as_a_share_of_the_bar(self):
        readings = {}
        for level in (10, 11, 12):
            arena = Arena(7, levels=(level, level))
            arena.play([Action(-1)] * 2, 100)
            move = next(move for move in legal_actions(arena.battle, 0) if move.card >= 0)
            arena.play([move, Action(-1)], 30)
            row = next(row for row in arena.state()["entities"] if row[FIELDS["card_id"]] >= 0)
            self.assertEqual(row[FIELDS["hp"]], row[FIELDS["max_hp"]])
            body = decision_context(arena.observe(0), [])["bodies"]["own"][0]
            readings[level] = (row[FIELDS["max_hp"]], CATALOGUE.health(body["kind"], body["hp"]))
        # The engine's hit points grow with level; the bar is full at each.
        self.assertLess(readings[10][0], readings[11][0])
        self.assertLess(readings[11][0], readings[12][0])
        self.assertEqual({health for _full, health in readings.values()}, {1.0})


if __name__ == "__main__":
    unittest.main()
