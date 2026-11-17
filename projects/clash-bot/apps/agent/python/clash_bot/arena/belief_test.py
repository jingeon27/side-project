"""Hidden hands rebuilt from public plays reproduce the observed game."""

import unittest

from clash_bot.arena.belief import BeliefSampler, compatible_openings
from clash_bot.arena.candidates import legal_actions
from clash_bot.arena.engine import Arena, public_board
from clash_bot.arena.rules import Action, deck_ids


class BeliefTest(unittest.TestCase):
    def test_belief_world_replays_public_plays_and_preserves_our_known_hand(self):
        arena = Arena(7)
        arena.play([Action(-1)] * 2, 100)
        for _ in range(5):
            moves = [
                next(
                    (action for action in legal_actions(arena.battle, team) if action.card >= 0),
                    Action(-1),
                )
                for team in (0, 1)
            ]
            arena.play(moves, 60)
        observation = arena.observe(0)
        sampled = BeliefSampler(observation, 555).sample()
        self.assertEqual(sampled.state()["tick"], arena.state()["tick"])
        self.assertEqual(sampled.state()["players"][0]["hand"], arena.state()["players"][0]["hand"])
        self.assertEqual(
            sampled.state()["players"][0]["next_card"], arena.state()["players"][0]["next_card"]
        )

    def test_each_side_plays_its_own_deck_and_beliefs_draw_from_it(self):
        arena = Arena(11, decks=["hog_cycle", "giant_beatdown"])
        arena.play([Action(-1)] * 2, 100)
        moves = [
            next(action for action in legal_actions(arena.battle, team) if action.card >= 0)
            for team in (0, 1)
        ]
        arena.play(moves, 60)
        state = arena.state()
        self.assertTrue(set(state["players"][0]["hand"]) <= set(deck_ids("hog_cycle")))
        self.assertTrue(set(state["players"][1]["hand"]) <= set(deck_ids("giant_beatdown")))
        observation = arena.observe(0)
        self.assertEqual(observation["decks"], ["hog_cycle", "giant_beatdown"])
        enemy = compatible_openings(observation, 1)
        self.assertTrue(all(sorted(order) == sorted(deck_ids("giant_beatdown")) for order in enemy))
        sampled = BeliefSampler(observation, 4).sample()
        self.assertEqual(sampled.decks, ["hog_cycle", "giant_beatdown"])
        self.assertEqual(sampled.state()["players"][0]["hand"], state["players"][0]["hand"])
        with self.assertRaisesRegex(ValueError, "draw order"):
            Arena(1, [deck_ids("bait")] * 2, ["hog_cycle", "hog_cycle"])

    def test_delayed_plays_and_our_own_pending_play_rebuild_the_same_game(self):
        arena = Arena(11, decks=["hog_cycle", "giant_beatdown"], delays=(22, 18), levels=(12, 10))
        arena.play([Action(-1)] * 2, 100)
        for _ in range(3):
            moves = [
                next(
                    (action for action in legal_actions(arena.battle, team) if action.card >= 0),
                    Action(-1),
                )
                for team in (0, 1)
            ]
            arena.play(moves, 50)
        arena.play([Action(-1)] * 2, 60)
        own = next(action for action in legal_actions(arena.battle, 0) if action.card >= 0)
        arena.play([own, Action(-1)], 5)
        observation = arena.observe(0)
        self.assertEqual([row["action"] for row in observation["pending"]], [own.row()])
        sampled = BeliefSampler(observation, 9).sample()
        self.assertEqual(public_board(sampled.state()), public_board(arena.state()))
        self.assertEqual(sampled.pending, arena.pending)
        # The rebuilt world runs our pending play on the same tick as the real one.
        for world in (arena, sampled):
            world.play([Action(-1)] * 2, 30)
        self.assertEqual(public_board(sampled.state()), public_board(arena.state()))
        self.assertEqual(sampled.history[-1]["tick"], arena.history[-1]["tick"])


if __name__ == "__main__":
    unittest.main()
