import unittest

import numpy as np

from .clock import DECISION_TICKS, WAIT, advance_window, opponent_offsets
from .engine import Arena
from .rules import TILE, Action


class RolloutDecisionClockTest(unittest.TestCase):
    def test_public_execution_reveals_phase_only_after_the_delayed_input_runs(self):
        deck = [5, 7, 4, 0, 1, 2, 3, 6]
        world = Arena(7, [deck, deck], delays=(18, 22))
        rng = np.random.default_rng(99)
        world.play([WAIT, WAIT], 107)
        world.play([WAIT, Action(5, 14 * TILE, 25 * TILE)], 13)
        offsets, source = opponent_offsets(world.observe(0), rng, 4)
        self.assertEqual(source, "sampled_unresolved_phase")
        self.assertEqual(len(offsets), 4)
        self.assertTrue(all(0 <= phase < DECISION_TICKS for phase in offsets))
        world.play([WAIT, WAIT], 20)
        self.assertEqual(opponent_offsets(world.observe(0), rng, 4), ([7] * 4, "public_execution"))

    def test_asynchronous_rollout_replays_the_same_delayed_commands_as_the_native_timeline(self):
        deck = [5, 7, 4, 0, 1, 2, 3, 6]
        world = Arena(17, [deck, deck], delays=(18, 22))
        world.play([WAIT, WAIT], 100)
        reference = world.clone()
        attack = Action(5, 4 * TILE, 8 * TILE)
        defense = Action(7, 14 * TILE, 24 * TILE)
        seen, own_ticks = [], []

        def respond(arena, enemy):
            observation = arena.observe(enemy, include_legal=False)
            seen.append((observation["state"]["tick"], len(observation["history"])))
            return defense if seen[-1] == (119, 1) else WAIT

        def continue_own(arena, team):
            own_ticks.append(arena.state()["tick"])
            return WAIT

        advance_window(world, 0, attack, 60, 19, respond, continue_own)
        reference.play([attack, WAIT], 19)
        reference.play([WAIT, defense], 1)
        for elapsed in (19, 1, 19, 1):
            reference.play([WAIT, WAIT], elapsed)
        self.assertEqual(seen, [(119, 1), (139, 1), (159, 2)])
        self.assertEqual(own_ticks, [120, 140])
        self.assertEqual([event["tick"] for event in world.history], [118, 141])
        self.assertEqual(world.history, reference.history)
        self.assertEqual(world.battle.state_hash(), reference.battle.state_hash())

    def test_simultaneous_inputs_share_the_pre_action_observation(self):
        deck = [5, 7, 4, 0, 1, 2, 3, 6]
        world = Arena(17, [deck, deck])
        world.play([WAIT, WAIT], 100)
        attack = Action(5, 14 * TILE, 24 * TILE)
        seen = []

        def respond(arena, team):
            seen.append((team, arena.state()["tick"], len(arena.history)))
            return WAIT

        advance_window(world, 1, attack, DECISION_TICKS, 0, respond)
        self.assertEqual(seen, [(0, 100, 0)])
        self.assertEqual(world.history[0]["plays"][0]["team"], 1)
