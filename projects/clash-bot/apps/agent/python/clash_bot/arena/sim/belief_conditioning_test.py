import copy
import unittest

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.belief import BeliefSampler, PublicRootMismatch
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import FIELDS, TILE, Action
from clash_bot.arena.study.export import export
from clash_bot.arena.study.teacher import Teacher
from clash_bot.arena.training.search import search


def position():
    order = [5, 7, 0, 4, 1, 2, 3, 6]
    arena = Arena(1, [order, order], delays=(22, 18))
    arena.play([Action(-1)] * 2, 100)
    arena.play([Action(5, 6 * TILE, 6 * TILE), Action(-1)], 80)
    return arena


def shifted(observation, tiles):
    result = copy.deepcopy(observation)
    row = next(row for row in result["state"]["entities"] if row[FIELDS["card_id"]] == 5)
    row[FIELDS["x"]] += round(tiles * TILE)
    return result


class BoundedBeliefTest(unittest.TestCase):
    def test_visual_qwen_export_also_rejects_position_bounded_search_labels(self):
        game = {
            "completed": True,
            "rejectedCommands": 0,
            "setup": {"decks": ["counterpush", "counterpush"]},
            "samples": [
                {
                    "outcome": 1,
                    "search": {
                        "simulations": 16,
                        "reconstruction": "public_board_position_bounded",
                    },
                }
            ],
        }
        self.assertIsNone(export("/unused", [game]))

    def test_mobile_drift_is_recorded_without_replacing_the_observed_board(self):
        observation = shifted(position().observe(0), 0.1)
        sampler = BeliefSampler(observation, 11)
        with self.assertRaises(PublicRootMismatch):
            sampler.conditioned()
        sampler.conditioned(position_tolerance_tiles=0.25)
        self.assertEqual(sampler.conditioning["mode"], "position_bounded")
        self.assertAlmostEqual(sampler.conditioning["maxPositionErrorTiles"], 0.1)
        result = search(observation, Policy(), 11, simulations=2, depth=2)
        self.assertEqual(result["reconstruction"], "public_board_position_bounded")
        self.assertTrue(
            all(row["maxPositionErrorTiles"] <= 0.25 for row in result["rootConditioning"])
        )

    def test_strict_teacher_skips_a_position_that_only_the_bounded_search_accepts(self):
        observation = shifted(position().observe(0), 0.1)
        self.assertIsNone(Teacher().label(observation, "bounded-is-not-exact", "scenario-2"))

    def test_excessive_position_error_or_any_hp_error_still_stops_reconstruction(self):
        original = position().observe(0)
        cases = [shifted(original, 0.3), copy.deepcopy(original)]
        row = next(row for row in cases[1]["state"]["entities"] if row[FIELDS["card_id"]] == 5)
        row[FIELDS["hp"]] -= 1
        for observation in cases:
            with self.assertRaises(PublicRootMismatch):
                BeliefSampler(observation, 11).conditioned(position_tolerance_tiles=0.25)

    def test_a_kept_particle_records_the_bound_when_resumed(self):
        arena = position()
        first = BeliefSampler(arena.observe(0), 11, keep=True)
        world, _ = first.conditioned()
        arena.play([Action(-1)] * 2, 20)
        later = BeliefSampler(shifted(arena.observe(0), 0.1), 12, keep=True)
        self.assertIsNotNone(later.resume(first.sampled, world, position_tolerance_tiles=0.25))
        self.assertEqual(later.conditioning["mode"], "position_bounded")
