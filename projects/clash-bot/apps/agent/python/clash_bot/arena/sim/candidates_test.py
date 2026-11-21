"""Placement-rule tiles and the dense grid: legal for every pool card, the same as the live rules."""

import unittest

from clash_bot.arena.placement import DEPLOYMENT
from clash_bot.arena.sim.candidates import dense_actions, legal_actions
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, CARDS, DECKS, TILE, Action, canonical, deck_ids


def tiles(arena, team, card):
    return [
        canonical(action.x / TILE, action.y / TILE, team)
        for action in legal_actions(arena.battle, team)
        if action.card == card
    ]


class CandidateTest(unittest.TestCase):
    def test_mirror_copies_spell_placement_and_charges_its_own_visible_hand_cost(self):
        zap, mirror = CARD_ID["Zap"], CARD_ID["Mirror"]
        deck = next(n for n, d in DECKS.items() if {"Zap", "Mirror"} <= set(d.cards))
        others = [c for c in deck_ids(deck) if c not in (zap, mirror)]
        order = [zap, *others[:3], mirror, *others[3:]]
        arena = Arena(12, [order, order], [deck, deck], delays=[22, 22])
        arena.play([Action(-1)] * 2, 320)
        cast = next(a for a in legal_actions(arena.battle, 0) if a.card == zap and a.y > 16 * TILE)
        arena.play([cast, Action(-1)], 80)
        copied = Action(mirror, cast.x, cast.y)
        self.assertIn(copied, legal_actions(arena.battle, 0))
        self.assertIn(copied, dense_actions(arena.battle, 0))
        player = arena.state()["players"][0]
        self.assertEqual(player["hand_costs"][player["hand"].index(mirror)], 3)
        arena.play([copied, Action(-1)], 64)
        self.assertEqual(
            arena.history[-1]["plays"], [{"team": 0, "action": copied.row(), "cost": 3}]
        )

    def test_both_sides_offer_legal_poison_at_the_observed_enemy_graveyard(self):
        deck = [3, 6, 4, 7, 0, 1, 2, 5]
        point = 3.7, 7
        for team in (0, 1):
            arena = Arena(41, [deck, deck])
            arena.play([Action(-1)] * 2, 220)
            x, y = canonical(*point, team)
            moves = [Action(-1), Action(-1)]
            moves[1 - team] = Action(3, round(x * TILE), round(y * TILE))
            arena.play(moves, 22)
            (grave,) = arena.state()["spells"]
            observed = canonical(grave[3] / TILE, grave[4] / TILE, team)
            self.assertEqual(tiles(arena, team, 6)[0], observed)

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
                # Full mana also covers the new 7/8-elixir cards; cost filtering is intentional.
                arena.play([Action(-1)] * 2, 300)
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
