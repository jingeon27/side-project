"""Native Drill defense: the roll must go through it from below, not away or across lanes."""

import unittest

from .engine import Arena
from .rules import CARD_ID, TILE, Action, deck_ids


def drill_damage(target):
    own, enemy = deck_ids("counterpush"), deck_ids("drill_control")
    drill = CARD_ID["GoblinDrill"]
    enemy = [drill, *(card for card in enemy if card != drill)]
    arena = Arena(41, [own, enemy], decks=["counterpush", "drill_control"], delays=(22, 22))
    arena.play([Action(-1)] * 2, 100)
    arena.play([Action(-1), Action(drill, round(3.5 * TILE), round(6.5 * TILE))], 60)
    before = sum(arena.state()["players"][0]["tower_hp"])
    action = (
        Action(-1)
        if target is None
        else Action(CARD_ID["BarbLog"], *(round(v * TILE) for v in target))
    )
    outcomes = arena.play([action, Action(-1)], 240)
    if any(row[1] != 0 for row in outcomes):
        raise ValueError("Drill scenario rejected its defense input")
    return before - sum(arena.state()["players"][0]["tower_hp"])


class NativeBarrelDefenseTest(unittest.TestCase):
    def test_deploying_below_drill_preserves_more_tower_hp_than_wrong_side_or_above(self):
        baseline = drill_damage(None)
        below = drill_damage([3.5, 2])
        self.assertLess(below, baseline)
        for target in ([3.5, 6.5], [3.5, 10.5], [14.5, 2]):
            with self.subTest(target=target):
                self.assertGreater(drill_damage(target), below)
