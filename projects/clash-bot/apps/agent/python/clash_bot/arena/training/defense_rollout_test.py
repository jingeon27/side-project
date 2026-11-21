import unittest

import numpy as np

from clash_bot.arena.policy.context import decision_context
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, LIVE_DECK, TILE, Action, canonical, deck_ids
from clash_bot.arena.training.defense_rollout import comparisons, observed_attack


class DefenseComparisonTest(unittest.TestCase):
    def test_close_barrel_tiles_against_an_executed_drill_on_either_side(self):
        for team in (0, 1):
            with self.subTest(team=team):
                decks = ["drill_control", "drill_control"]
                decks[team] = LIVE_DECK
                orders = [deck_ids(deck) for deck in decks]
                worlds = [Arena(seed, orders, decks, delays=(22, 22)) for seed in (41, 59)]
                xy = canonical(3.5, 6.5, team)
                drill = Action(CARD_ID["GoblinDrill"], *(round(v * TILE) for v in xy))
                wait = Action(-1)
                moves = [drill, drill]
                moves[team] = wait
                for world in worlds:
                    world.play([wait, wait], 100)
                    self.assertEqual(world.play(moves, 120)[0][1], 0)
                observation = worlds[0].observe(team)
                legal = [Action(*row) for row in observation["legalActions"]]
                context = decision_context(observation, legal)
                attack = observed_attack(context)
                self.assertEqual(attack, "drill")

                barrels = [a for a in legal if a.card == CARD_ID["BarbLog"]]
                # Put the high-prior roll below and just to the outside of the drill.
                xy = canonical(4.5, 2.5, team)
                anchor = Action(CARD_ID["BarbLog"], *(round(v * TILE) for v in xy))
                self.assertIn(anchor, barrels)
                actions = [wait, anchor, *(a for a in barrels if a != anchor)]
                prior = np.ones(len(actions))
                prior[1] = 2
                snapshots = [world.battle.save() for world in worlds]
                result = comparisons(
                    worlds[0].clone(), worlds, snapshots, team, actions, prior, attack
                )
                self.assertGreater(result["compared"], 2)
                self.assertEqual([world.battle.save() for world in worlds], snapshots)
                pair = next(
                    p
                    for p in result["pairs"]
                    if p["preferredAction"][0] == p["otherAction"][0] == CARD_ID["BarbLog"]
                )
                self.assertGreaterEqual(min(pair["savedHP"]), 50)
                self.assertNotEqual(pair["preferredAction"], pair["otherAction"])

    def test_unseen_or_enemy_side_effect_is_not_a_defense_label(self):
        context = {
            "bodies": {"enemy": [{"kind": "?", "x": 4, "y": 6}]},
            "effects": [["red", "graveyard", 3, 25, 0.5]],
        }
        self.assertIsNone(observed_attack(context))
        context["effects"].append(["red", "graveyard", 3, 6, 0.5])
        self.assertEqual(observed_attack(context), "graveyard")
