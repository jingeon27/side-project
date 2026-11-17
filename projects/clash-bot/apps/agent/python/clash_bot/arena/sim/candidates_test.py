"""Placement-rule tiles and the dense grid: legal for every pool card, the same as the live rules."""

import unittest

from clash_bot.arena.sim.candidates import dense_actions, legal_actions, placement_tiles
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARDS, DECKS, DEPLOYMENT, TILE, Action, canonical, deck_ids


def tiles(arena, team, card):
    return [
        canonical(action.x / TILE, action.y / TILE, team)
        for action in legal_actions(arena.battle, team)
        if action.card == card
    ]


class CandidateTest(unittest.TestCase):
    def test_wait_remains_available_at_high_elixir_instead_of_forcing_a_card_or_skill(self):
        arena = Arena(41)
        arena.play([Action(-1)] * 2, 320)
        self.assertGreaterEqual(arena.state()["players"][0]["elixir_milli"], 8000)
        self.assertIn(Action(-1), legal_actions(arena.battle, 0))

    def test_both_sides_can_choose_and_deploy_troops_behind_the_king_tower(self):
        deck = [5, 1, 4, 7, 0, 2, 3, 6]
        arena = Arena(42, [deck, deck])
        arena.play([Action(-1)] * 2, 100)
        for team in (0, 1):
            for card in deck[:4]:
                actions = [
                    action for action in legal_actions(arena.battle, team) if action.card == card
                ]
                for tile in DEPLOYMENT.kingBackTiles:
                    with self.subTest(team=team, card=card, tile=tile):
                        action = next(
                            (
                                action
                                for action in actions
                                if canonical(action.x / TILE, action.y / TILE, team) == tile
                            ),
                            None,
                        )
                        self.assertIsNotNone(action)
                        clone = arena.clone()
                        result = clone.play(
                            [action if side == team else Action(-1) for side in (0, 1)], 1
                        )
                        self.assertEqual(result[0][1], 0)

    def test_every_pool_deck_card_gets_a_legal_tile_for_both_sides(self):
        for name in sorted(DECKS):
            ids = deck_ids(name)
            # Two draw orders put every one of the eight cards in an opening hand.
            for order in (ids, ids[4:] + ids[:4]):
                arena = Arena(5, [order, order], [name, name])
                arena.play([Action(-1)] * 2, 100)
                for team in (0, 1):
                    for card in arena.state()["players"][team]["hand"]:
                        with self.subTest(deck=name, team=team, card=CARDS[card]):
                            self.assertTrue(tiles(arena, team, card))

    def test_counterpush_cards_keep_their_placement_tiles(self):
        deck = [5, 3, 2, 6, 0, 1, 4, 7]  # knight, graveyard, hut, poison in hand
        arena = Arena(3, [deck, deck])
        arena.play([Action(-1)] * 2, 100)
        lanes = [(3.5, 10), (14.5, 10), (3.5, 14), (14.5, 14), *DEPLOYMENT.kingBackTiles]
        self.assertEqual(tiles(arena, 0, 5), lanes)
        self.assertEqual(
            tiles(arena, 0, 3),
            [(3.5, 25.5), (2.7, 25), (3.5, 24.5), (14.5, 25.5), (15.3, 25), (14.5, 24.5)],
        )
        self.assertEqual(
            tiles(arena, 0, 2), [(9, 9), (7, 12), (11, 12), (3.5, 10), (14.5, 10), (9, 6)]
        )
        # Enemy princess towers when no enemy unit is on the field.
        self.assertEqual(tiles(arena, 0, 6), [(3.5, 25.5), (14.5, 25.5)])

    def test_placement_rules_match_the_live_candidates(self):
        # src/core/fast/candidates.spec.ts expects the same tiles for these rules.
        self.assertEqual(
            placement_tiles("tower_spell", None, []),
            [(3.5, 25.5), (14.5, 25.5), (3.5, 23.5), (14.5, 23.5)],
        )
        self.assertEqual(
            placement_tiles("anywhere", None, []),
            [(3.5, 22.5), (14.5, 22.5), (3.5, 28.5), (14.5, 28.5)],
        )
        self.assertEqual(placement_tiles("ranged_troop", (14.5, 12), [])[0], (14.5, 9))
        self.assertEqual(placement_tiles("troop", (14.5, 12), [])[:2], [(14.5, 11), (9, 11)])
        self.assertEqual(placement_tiles("unsupported", (14.5, 12), []), [])


class DenseCandidateTest(unittest.TestCase):
    def test_the_grid_follows_the_rule_tiles_and_stays_legal(self):
        arena = Arena(3, [[5, 3, 2, 6, 0, 1, 4, 7]] * 2)
        arena.play([Action(-1)] * 2, 100)
        rules, dense = legal_actions(arena.battle, 0), dense_actions(arena.battle, 0)
        self.assertEqual(dense[0], Action(-1))
        self.assertTrue(set(rules) <= set(dense))
        knight = [action for action in dense if action.card == 5]
        lanes = [action for action in rules if action.card == 5]
        # The placement-rule tiles come first, then every legal own-side tile.
        self.assertEqual(knight[: len(lanes)], lanes)
        self.assertGreater(len(knight), 200)
        poison = [action for action in dense if action.card == 6]
        self.assertGreater(len(poison), 100)
        state = arena.state()
        hand = state["players"][0]["hand"]
        for action in dense[1:]:
            self.assertEqual(
                arena.battle.check_deploy(0, hand.index(action.card), action.x, action.y), 0
            )
        self.assertEqual(len(dense), len(set(dense)))


if __name__ == "__main__":
    unittest.main()
