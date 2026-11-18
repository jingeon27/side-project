import json
import unittest

from clash_bot.arena.sim.belief import BeliefSampler
from clash_bot.arena.sim.clock import DECISION_TICKS
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import TILE, Action
from clash_bot.arena.training.response import rollout


class ReactiveFutureTest(unittest.TestCase):
    def test_defender_responds_to_a_graveyard_in_a_sampled_world_and_leaves_real_root_untouched(
        self,
    ):
        real = Arena(18, [[3, 5, 6, 0, 1, 2, 4, 7]] * 2)
        real.play([Action(-1)] * 2, 240)
        observed = real.observe(0)
        before = json.dumps(observed, sort_keys=True)
        world, _attempts = BeliefSampler(observed, 29).conditioned()
        begin = observed["state"]["tick"]
        end, deployments = rollout(world, 0, Action(3, round(15.3 * TILE), 25 * TILE), 240, 5, 7)
        self.assertGreater(deployments, 0)
        self.assertEqual(end["tick"], observed["state"]["tick"] + 240)
        self.assertEqual(json.dumps(real.observe(0), sort_keys=True), before)
        self.assertEqual(
            {
                (event["tick"] - begin) % DECISION_TICKS
                for event in world.history
                if event["tick"] > begin
                for play in event["plays"]
                if play["team"] == 1
            },
            {7},
        )
        self.assertTrue(
            all(
                play["team"] == 1 or play["action"][0] == 3
                for event in world.history
                if event["tick"] > observed["state"]["tick"]
                for play in event["plays"]
            )
        )
