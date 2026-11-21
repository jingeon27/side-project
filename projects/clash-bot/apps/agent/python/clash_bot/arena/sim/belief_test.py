"""Hidden hands rebuilt from public plays reproduce the observed game."""

import unittest

from clash_bot.arena.sim.belief import BeliefSampler, compatible_openings
from clash_bot.arena.sim.candidates import legal_actions
from clash_bot.arena.sim.engine import Arena, public_board
from clash_bot.arena.sim.rules import CARD_ID, DECKS, TILE, Action, deck_ids


class BeliefTest(unittest.TestCase):
    def test_fifo_hypotheses_require_the_card_at_acceptance_before_the_previous_draw(self):
        names = [
            "Log",
            "IceSpirits",
            "Skeletons",
            "Musketeer",
            "IceGolemite",
            "Cannon",
            "HogRider",
            "Fireball",
        ]
        own = [CARD_ID[name] for name in names]
        arena = Arena(
            1, [deck_ids("counterpush"), own], ["counterpush", "hog_cycle"], delays=(24, 21)
        )
        arena.play([Action(-1)] * 2, 100)
        for name, x, y, ticks in [
            ("Log", 13.5, 20.5, 20),
            ("Skeletons", 2.5, 25.5, 20),
            ("IceSpirits", 17.5, 23.5, 20),
            ("Cannon", 13.5, 24.5, 80),
            ("IceGolemite", 3.5, 30.5, 100),
        ]:
            results = arena.play(
                [Action(-1), Action(CARD_ID[name], round(x * TILE), round(y * TILE))], ticks
            )
            self.assertEqual(results[0][1], 0)
        # Swapping Cannon's draw later can fit the final hand but makes it absent
        # at the tick its input was accepted. Such a world must not enter search.
        orders = compatible_openings(arena.observe(1), 1, "hog_cycle")
        self.assertEqual(orders, (tuple(own),))
        for team in (0, 1):
            for seed in range(5):
                sampled, _ = BeliefSampler(arena.observe(team), seed).conditioned()
                self.assertEqual(public_board(sampled.state()), public_board(arena.state()))

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
        sampled, _ = BeliefSampler(observation, 555).conditioned()
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
        self.assertEqual(observation["decks"], ["hog_cycle", None])
        enemy = compatible_openings(observation, 1, "giant_beatdown")
        self.assertTrue(all(sorted(order) == sorted(deck_ids("giant_beatdown")) for order in enemy))
        sampled, _ = BeliefSampler(observation, 4).conditioned()
        self.assertEqual(public_board(sampled.state()), public_board(arena.state()))
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
        sampled, _ = BeliefSampler(observation, 9).conditioned()
        self.assertEqual(public_board(sampled.state()), public_board(arena.state()))
        self.assertEqual(sampled.pending, arena.pending)
        # The rebuilt world runs our pending play on the same tick as the real one.
        for world in (arena, sampled):
            world.play([Action(-1)] * 2, 30)
        self.assertEqual(public_board(sampled.state()), public_board(arena.state()))
        self.assertEqual(sampled.history[-1]["tick"], arena.history[-1]["tick"])

    def test_enemy_deck_is_inferred_only_after_its_delayed_card_becomes_public(self):
        own, enemy = deck_ids("counterpush"), deck_ids("drill_control")
        arena = Arena(1, [own, enemy], ["counterpush", "drill_control"], delays=(22, 22))
        arena.play([Action(-1)] * 2, 100)
        drill = Action(enemy[0], round(3.5 * TILE), round(6.5 * TILE))
        arena.play([Action(-1), drill], 1)
        observation = arena.observe(0)
        sampler = BeliefSampler(observation, 77)
        self.assertEqual(set(sampler.openings[1]), set(DECKS))
        self.assertEqual(observation["pending"], [])
        arena.play([Action(-1)] * 2, 25)
        sampler = BeliefSampler(arena.observe(0), 77)
        compatible = {name for name in DECKS if enemy[0] in deck_ids(name)}
        self.assertIn("drill_control", compatible)
        self.assertEqual(set(sampler.openings[1]), compatible)
        observation["decks"][1] = "drill_control"
        with self.assertRaisesRegex(ValueError, "hide the opponent deck"):
            BeliefSampler(observation, 77)


def first_card(arena, team):
    return next(
        (action for action in legal_actions(arena.battle, team) if action.card >= 0), Action(-1)
    )


class KeptHypothesisTest(unittest.TestCase):
    def test_a_kept_hypothesis_continues_to_the_world_a_replay_from_the_first_tick_builds(self):
        arena = Arena(11, decks=["hog_cycle", "giant_beatdown"], delays=(22, 18), levels=(12, 10))
        arena.play([Action(-1)] * 2, 100)
        scratch, kept, continued = Arena(0), None, 0
        for step in range(16):
            # Both sides play now and then, so delayed, pending and public plays all occur.
            moves = [first_card(arena, team) if step % 3 == team else Action(-1) for team in (0, 1)]
            arena.play(moves, 20)
            observation = arena.observe(0)
            sampler = BeliefSampler(observation, 100 + step, keep=True)
            world = sampler.resume(kept, into=scratch) if kept else None
            if world is None:
                sampler.conditioned(into=scratch)
                kept = sampler.sampled
                continue
            continued += 1
            rebuilt = BeliefSampler(observation, 0).world(kept.names, kept.orders, kept.seed)
            self.assertEqual(world.battle.state_hash(), rebuilt.battle.state_hash())
            self.assertEqual(world.history, rebuilt.history)
            self.assertEqual(world.pending, rebuilt.pending)
            self.assertEqual(public_board(world.state()), public_board(arena.state()))
            self.assertEqual(kept.frontier, observation["state"]["tick"] - 18)
        self.assertGreaterEqual(continued, 8)
        self.assertGreater(len(arena.history), 3)

    def test_a_hypothesis_of_the_wrong_deck_ends_when_the_opponent_card_becomes_public(self):
        own, enemy = deck_ids("counterpush"), deck_ids("drill_control")
        arena = Arena(1, [own, enemy], ["counterpush", "drill_control"], delays=(22, 22))
        arena.play([Action(-1)] * 2, 100)
        kept = {}
        for seed in range(40):
            sampler = BeliefSampler(arena.observe(0), seed, keep=True)
            sampler.conditioned()
            name = sampler.sampled.names[1]
            if name == "drill_control" or enemy[0] not in deck_ids(name):
                kept.setdefault(name == "drill_control", sampler.sampled)
        self.assertEqual(set(kept), {True, False})
        arena.play([Action(-1), Action(enemy[0], round(3.5 * TILE), round(6.5 * TILE))], 60)
        sampler = BeliefSampler(arena.observe(0), 9, keep=True)
        self.assertEqual(
            set(sampler.openings[1]), {name for name in DECKS if enemy[0] in deck_ids(name)}
        )
        self.assertIsNone(sampler.resume(kept[False], into=Arena(0)))
        right = sampler.resume(kept[True], into=Arena(0))
        # The right deck continues only if its guessed opening hand held the played card.
        if right is not None:
            self.assertEqual(public_board(right.state()), public_board(arena.state()))

    def test_a_hypothesis_saved_from_a_different_past_cannot_continue(self):
        games = [Arena(5, delays=(20, 20)), Arena(5, delays=(20, 20))]
        for game in games:
            game.play([Action(-1)] * 2, 100)
        # Only the second game's opponent played before the save.
        games[1].play([Action(-1), first_card(games[1], 1)], 60)
        games[0].play([Action(-1)] * 2, 60)
        sampler = BeliefSampler(games[0].observe(0), 3, keep=True)
        sampler.conditioned()
        kept = sampler.sampled
        for game in games:
            game.play([Action(-1)] * 2, 40)
        self.assertIsNotNone(
            BeliefSampler(games[0].observe(0), 4, keep=True).resume(kept, into=Arena(0))
        )
        sampler = BeliefSampler(games[1].observe(0), 4, keep=True)
        if all(
            tuple(order) in pool.get(name, ())
            for pool, name, order in zip(sampler.openings, kept.names, kept.orders)
        ):
            # Its draw order still fits, but its world never saw that play.
            self.assertIsNone(sampler.resume(kept, into=Arena(0)))
            self.assertNotEqual(sampler.last_board, public_board(games[1].state()))


if __name__ == "__main__":
    unittest.main()
