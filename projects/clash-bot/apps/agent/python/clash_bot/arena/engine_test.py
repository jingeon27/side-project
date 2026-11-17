import json
import unittest

from clash_bot.arena.engine import (
    CARDS,
    DECKS,
    DEPLOYMENT,
    FIELDS,
    LIVE_DECK,
    TILE,
    Action,
    Arena,
    BeliefSampler,
    canonical,
    compatible_openings,
    deck_ids,
    legal_actions,
    placement_tiles,
    public_mana,
    rules_identity,
)


class NativeArenaTest(unittest.TestCase):
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

    def test_current_eight_card_deck_forms_and_exact_snapshot_branching(self):
        arena = Arena(13)
        self.assertEqual(arena.state()["players"][0]["forms"], [0, 1, 0, 0, 2, 1, 0, 0])
        arena.play([Action(-1), Action(-1)], 100)
        clone = arena.clone()
        self.assertEqual(clone.battle.state_hash(), arena.battle.state_hash())
        move = next(action for action in legal_actions(arena.battle, 0) if action.card >= 0)
        arena.play([move, Action(-1)], 60)
        self.assertNotEqual(clone.battle.state_hash(), arena.battle.state_hash())
        clone.play([move, Action(-1)], 60)
        self.assertEqual(clone.battle.state_hash(), arena.battle.state_hash())
        self.assertEqual(rules_identity()["table"], "cards-160635007-20261103.1")

    def test_opponent_private_hand_next_and_balance_are_not_exposed(self):
        arena = Arena(7)
        observed = arena.observe(0)
        enemy = observed["state"]["players"][1]
        for name in ("hand", "next_card", "elixir_milli", "deck", "pending", "evo", "abilities"):
            self.assertNotIn(name, enemy)
        self.assertEqual(set(observed["initial_hand"]), set(arena.state()["players"][0]["hand"]))
        self.assertNotIn("rng", observed["state"])

    def test_public_regeneration_ledger_matches_native_costs_and_cap(self):
        arena = Arena(7)
        for _ in range(12):
            state = arena.state()
            for team in (0, 1):
                self.assertAlmostEqual(
                    public_mana(arena.history, state["tick"], team),
                    state["players"][team]["elixir_milli"] / 1000,
                    delta=0.05,
                )
            moves = [
                next(
                    (action for action in legal_actions(arena.battle, team) if action.card >= 0),
                    Action(-1),
                )
                for team in (0, 1)
            ]
            arena.play(moves, 180)
        arena.play([Action(-1)] * 2, 1000)
        self.assertEqual(public_mana(arena.history, arena.state()["tick"], 0), 10)

    def test_hero_activation_debits_two_without_card_or_evolution_cycle_movement(self):
        deck = [4, 5, 6, 7, 0, 1, 2, 3]
        arena = Arena(1, [deck, deck])
        arena.play([Action(-1)] * 2, 100)
        arena.play([Action(4, 6 * TILE, 6 * TILE), Action(-1)], 40)
        before = arena.state()["players"][0]
        self.assertEqual(arena.battle.check_deploy(0, 4, 0, 0), 0)
        arena.play([Action(-2), Action(-1)], 1)
        after = arena.state()["players"][0]
        self.assertEqual(before["hand"], after["hand"])
        self.assertEqual(before["next_card"], after["next_card"])
        self.assertEqual(before["evo"], after["evo"])
        self.assertAlmostEqual(
            (before["elixir_milli"] - after["elixir_milli"]) / 1000, 2, delta=0.05
        )

    def test_furnace_children_do_not_cost_a_new_card(self):
        arena = Arena(1, [list(range(8))] * 2)
        arena.play([Action(-1)] * 2, 100)
        arena.play([Action(1, 6 * TILE, 5 * TILE), Action(-1)], 1)
        types = json.loads(arena.battle.unit_types_json())
        found = set()
        for _ in range(16):
            arena.play([Action(-1)] * 2, 20)
            found.update(
                types[row[FIELDS["unit_type"]]]
                for row in arena.state()["entities"]
                if row[FIELDS["card_id"]] == 1
            )
        self.assertGreaterEqual(len(found), 2)
        self.assertEqual(len(arena.history), 1)
        self.assertEqual(arena.history[0]["plays"][0]["cost"], 4)

    def test_knight_evolution_recharges_only_on_its_own_card_plays(self):
        deck = [5, 7, 0, 4, 1, 2, 3, 6]
        arena = Arena(1, [deck, deck])
        arena.play([Action(-1)] * 2, 100)
        charges = []
        for count in range(3):
            while 5 not in arena.state()["players"][0]["hand"]:
                arena.play([Action(-1)] * 2, 200)
                # Cycle safely in the rear; first-candidate ordering must not end this fixture early.
                other = min(
                    (a for a in legal_actions(arena.battle, 0) if a.card >= 0),
                    key=lambda action: canonical(action.x / TILE, action.y / TILE, 0)[1],
                )
                arena.play([other, Action(-1)], 1)
            arena.play([Action(-1)] * 2, 200)
            result = arena.play([Action(5, 6 * TILE, 2 * TILE), Action(-1)], 1)
            self.assertEqual(result[0][1], 0)
            charges.append(next(row for row in arena.state()["players"][0]["evo"] if row[0] == 5))
        self.assertEqual([row[1] for row in charges], [1, 2, 0])
        self.assertEqual([row[2] for row in charges], [False, True, False])

    def test_hut_children_respond_to_an_approaching_unit_without_new_spending(self):
        own, enemy = [2, 7, 0, 4, 1, 5, 3, 6], [5, 7, 0, 4, 1, 2, 3, 6]
        arena = Arena(1, [own, enemy])
        arena.play([Action(-1)] * 2, 100)
        results = arena.play(
            [Action(2, 7 * TILE, 12 * TILE), Action(5, round(3.5 * TILE), 18 * TILE)], 1
        )
        self.assertTrue(all(row[1] == 0 for row in results))
        kinds = json.loads(arena.battle.unit_types_json())
        children = set()
        for _ in range(24):
            arena.play([Action(-1)] * 2, 20)
            children.update(
                kinds[row[FIELDS["unit_type"]]]
                for row in arena.state()["entities"]
                if row[FIELDS["card_id"]] == 2
            )
        self.assertTrue(any("SpearGoblin" in name for name in children), children)
        self.assertEqual(len(arena.history), 1)
        self.assertEqual([play["cost"] for play in arena.history[0]["plays"]], [4, 3])

    def test_poison_defense_reduces_graveyard_damage_in_the_native_field(self):
        own, enemy = [6, 7, 0, 4, 1, 5, 2, 3], [3, 7, 0, 4, 1, 5, 2, 6]
        arena = Arena(1, [own, enemy])
        arena.play([Action(-1)] * 2, 100)
        defended = arena.clone()
        x, y = round(14.5 * TILE), round(6.5 * TILE)
        arena.play([Action(-1), Action(3, x, y)], 240)
        defended.play([Action(6, x, y), Action(3, x, y)], 240)
        self.assertGreater(
            sum(defended.state()["players"][0]["tower_hp"]),
            sum(arena.state()["players"][0]["tower_hp"]),
        )

    def test_graveyard_has_repeatable_spawn_sequence_across_hidden_random_seeds(self):
        def sequence(seed):
            arena = Arena(seed, [list(range(8))] * 2)
            arena.play([Action(-1)] * 2, 100)
            arena.play([Action(3, round(3.5 * TILE), round(25.5 * TILE)), Action(-1)], 1)
            seen, rows = set(), []
            for _ in range(220):
                for row in arena.state()["entities"]:
                    if row[FIELDS["card_id"]] == 3 and row[0] not in seen:
                        seen.add(row[0])
                        rows.append((arena.state()["tick"], row[FIELDS["x"]], row[FIELDS["y"]]))
                arena.play([Action(-1)] * 2, 1)
            return rows

        first = sequence(1)
        self.assertEqual(len(first), 12)
        self.assertEqual(first, sequence(999))

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


def tiles(arena, team, card):
    return [
        canonical(action.x / TILE, action.y / TILE, team)
        for action in legal_actions(arena.battle, team)
        if action.card == card
    ]


class DeckPoolTest(unittest.TestCase):
    def test_the_live_deck_keeps_battle_ids_zero_to_seven(self):
        self.assertEqual(deck_ids(LIVE_DECK), list(range(8)))
        self.assertEqual(len(CARDS), len(set(CARDS)))
        self.assertTrue(all(card in CARDS for deck in DECKS.values() for card in deck.cards))

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
        # src/core/policy/fast-candidates.spec.ts expects the same tiles for these rules.
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


if __name__ == "__main__":
    unittest.main()
