"""Native mechanics through the arena: forms, costs, children, evolutions and the public ledger."""

import copy
import json
import unittest

import royalesim

from clash_bot.arena.sim.belief import BeliefSampler
from clash_bot.arena.sim.candidates import legal_actions
from clash_bot.arena.sim.elixir import public_mana
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.mechanics import field
from clash_bot.arena.sim.rules import FIELDS, TILE, Action, canonical, rules_identity


class NativeArenaTest(unittest.TestCase):
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


class InputDelayTest(unittest.TestCase):
    def test_overtime_input_cutoff_drops_a_pending_card_before_its_planned_tick(self):
        arena = Arena(1, delays=(22, 22))
        arena.battle = field(delays=(22, 22), start_tick=5990)
        result = arena.play([Action(0, 6 * TILE, 6 * TILE), Action(-1)], 40)
        self.assertEqual(result[0][1], 0)
        receipt = arena.battle.step_commands_run()[0]
        self.assertLess(receipt[0], 6012)
        self.assertEqual(royalesim.DEPLOY_REASONS[receipt[-1]], "GAME_OVER")
        self.assertEqual(arena.history, [])
        self.assertEqual(arena.pending, [])

    def test_a_skill_dropped_when_its_hero_dies_is_not_a_public_elixir_spend(self):
        arena = Arena(1, delays=(22, 22))
        arena.battle = field(
            units=[("IceWizardHero", 0, 9, 14, 1), ("Skeleton", 1, 9, 14.6, -1)],
            delays=(22, 22),
        )
        self.assertEqual(arena.battle.check_deploy(0, 4, 0, 0), 0)
        # Accepted now, but the 1-HP hero dies before the delayed press executes.
        results = arena.play([Action(-2), Action(-1)], 40)
        self.assertEqual(results[0][1], 0)
        runs = arena.battle.step_commands_run()
        self.assertEqual(len(runs), 1)
        self.assertNotEqual(runs[0][-1], 0)
        public_skills = [
            play for event in arena.history for play in event["plays"] if play["action"][0] == -2
        ]
        self.assertEqual(public_skills, [])
        self.assertEqual(arena.state()["players"][0]["elixir_milli"], 10000)

    def accepted(self, arena, team):
        play = next(Action(*row) for row in arena.observe(team)["legalActions"] if row[0] >= 0)
        actions = [Action(-1), Action(-1)]
        actions[team] = play
        result = arena.play(actions, 1)
        self.assertEqual(result[0][1], 0)
        return play, result[0][2]

    def test_a_delayed_play_runs_and_becomes_public_after_its_side_delay(self):
        arena = Arena(1, delays=(22, 18))
        arena.play([Action(-1)] * 2, 100)
        play, accepted = self.accepted(arena, 0)
        # Only the side that played knows it until it runs.
        self.assertEqual([row["action"] for row in arena.observe(0)["pending"]], [play.row()])
        self.assertEqual(arena.observe(1)["pending"], [])
        self.assertEqual(arena.observe(1)["history"], [])
        arena.play([Action(-1)] * 2, 20)
        self.assertEqual(arena.history, [])
        arena.play([Action(-1)] * 2, 5)
        self.assertEqual(arena.history[0]["tick"], accepted + 22)
        self.assertEqual(arena.history[0]["plays"][0]["action"], play.row())
        self.assertEqual(arena.observe(0)["pending"], [])

    def test_public_ledger_matches_native_elixir_with_delays_and_levels(self):
        arena = Arena(7, delays=(22, 18), levels=(12, 10))
        for _ in range(10):
            state = arena.state()
            for team in (0, 1):
                estimate = public_mana(arena.history, state["tick"], team)
                self.assertAlmostEqual(
                    estimate, state["players"][team]["elixir_milli"] / 1000, delta=0.05
                )
                # The observer's running ledger, also in a branch, equals the full recount.
                for world in (arena, arena.clone()):
                    self.assertEqual(
                        world.observe(1 - team)["state"]["players"][team]["elixir_range"],
                        [max(0, estimate - 0.05), min(10, estimate + 0.05)],
                    )
            moves = [
                next(
                    (action for action in legal_actions(arena.battle, team) if action.card >= 0),
                    Action(-1),
                )
                for team in (0, 1)
            ]
            arena.play(moves, 180)

    def test_observing_leaves_the_shared_state_unchanged_and_a_step_reads_it_again(self):
        arena = Arena(7)
        arena.battle = field(units=[("Giant", 0, 9, 13, -1), ("Skeleton", 1, 9, 14.6, -1)])
        arena.play([Action(-1)] * 2, 20)
        raw = arena.state()
        before = copy.deepcopy(raw)
        observed = [arena.observe(team) for team in (0, 1)]
        self.assertIs(arena.state(), raw)
        self.assertEqual(raw, before)
        target = FIELDS["target_uid"]
        self.assertTrue(any(row[target] != -1 for row in raw["entities"]))
        for team, view in enumerate(observed):
            self.assertTrue(all(row[target] == -1 for row in view["state"]["entities"]))
            self.assertIn("hand", view["state"]["players"][team])
            self.assertNotIn("hand", view["state"]["players"][1 - team])
        arena.play([Action(-1)] * 2, 1)
        self.assertIsNot(arena.state(), raw)
        self.assertEqual(raw, before)
        arena.battle = field(start_tick=300)
        self.assertEqual(arena.state()["tick"], 300)

    def test_card_levels_set_unit_strength(self):
        arena = Arena(1, [[5, 7, 0, 4, 1, 2, 3, 6]] * 2, levels=(12, 10))
        arena.play([Action(-1)] * 2, 100)
        arena.play([Action(5, 6 * TILE, 6 * TILE), Action(5, 6 * TILE, 26 * TILE)], 30)
        knights = {
            row[FIELDS["team"]]: row[FIELDS["max_hp"]]
            for row in arena.state()["entities"]
            if row[FIELDS["card_id"]] == 5
        }
        self.assertGreater(knights[0], knights[1])

    def test_each_sides_towers_are_as_strong_as_its_cards(self):
        towers = {
            levels: [
                player["tower_max_hp"] for player in Arena(1, levels=levels).state()["players"]
            ]
            for levels in ((11, 11), (12, 10), (10, 12))
        }
        level = {11: towers[(11, 11)][0], 12: towers[(12, 10)][0], 10: towers[(12, 10)][1]}
        self.assertEqual(towers[(11, 11)], [level[11], level[11]])
        self.assertEqual(towers[(10, 12)], [level[10], level[12]])
        for slot in range(3):
            self.assertLess(level[10][slot], level[11][slot])
            self.assertLess(level[11][slot], level[12][slot])
        # A rebuilt hypothesis world gets the same towers as the game it replays.
        arena = Arena(7, levels=(12, 10))
        arena.play([Action(-1)] * 2, 100)
        world, _attempts = BeliefSampler(arena.observe(0), 5).conditioned()
        self.assertEqual(
            [player["tower_max_hp"] for player in world.state()["players"]], towers[(12, 10)]
        )


if __name__ == "__main__":
    unittest.main()
