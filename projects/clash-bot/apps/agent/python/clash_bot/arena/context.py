"""Public decision context of one simulated position: the decision-v3 description the live screen also produces.

`clock` and `towers` are extra fields the text prompt does not serialize. The live screen sends the
clock and leaves `towers` out until tower hit points are read from the screen.
"""

import json
import math
from functools import cache

import numpy as np
from more_itertools import first_true, partition

from .engine import FIELDS, TILE, canonical, new_battle

ALIASES = (
    "barbarian_barrel",
    "furnace",
    "goblin_hut",
    "graveyard",
    "ice_wizard",
    "knight",
    "poison",
    "skeletons",
)
COSTS = (2, 4, 4, 5, 3, 3, 4, 1)
# Engine unit names to the screen's body names. Order matters: "firespirithut" before "firespirit".
BODY_PATTERNS = (
    ("firespirithut", "furnace"),
    ("goblinhut", "goblin_hut"),
    ("icewizard", "ice_wizard"),
    ("knight", "knight"),
    ("firespirit", "fire_spirit"),
    ("speargoblin", "spear_goblin"),
    ("skeleton", "skeleton"),
    ("barbarian", "barbarian"),
)


@cache
def unit_types():
    return tuple(json.loads(new_battle().unit_types_json()))


def body(kind):
    name = kind.lower()
    return first_true(BODY_PATTERNS, (None, "?"), lambda pattern: pattern[0] in name)[1]


def tower_fractions(player):
    hp = np.asarray(player["tower_hp"], np.float64)
    return [round(float(value), 3) for value in hp / np.maximum(1, player["tower_max_hp"])]


def tile(x, y, team):
    return [round(value, 1) for value in canonical(x / TILE, y / TILE, team)]


def action_row(index, action, team):
    match action.card:
        case -1:
            kind, card, cost = "wait", None, 0
        case -2:
            kind, card, cost = "ability", "ice_wizard", 2
        case played:
            kind, card, cost = "card", ALIASES[played], COSTS[played]
    return [chr(65 + index), kind, card, cost, *tile(action.x, action.y, team)]


def public_spell_age(observation, spell):
    def same_cast(team, card, x, y):
        return (
            team == spell[0]
            and card == spell[1]
            and math.hypot(x - spell[3], y - spell[4]) < TILE / 2
        )

    # Overlapping effects at the same point cannot be assigned a public cast
    # time confidently. Never consult private spell timers or internal ids.
    if sum(same_cast(row[0], row[1], row[3], row[4]) for row in observation["state"]["spells"]) > 1:
        return None
    ticks = [
        event["tick"]
        for event in observation["history"]
        if event["tick"] <= observation["state"]["tick"]
        and any(same_cast(play["team"], *play["action"]) for play in event["plays"])
    ]
    return math.floor((observation["state"]["tick"] - max(ticks)) / 20 + 0.5) if ticks else None


def decision_context(observation, actions, types=None):
    types = types or unit_types()
    state, team = observation["state"], observation["team"]
    own, enemy = state["players"][team], state["players"][1 - team]
    public_plays = [
        play["action"][0]
        for event in observation["history"]
        if event["tick"] <= state["tick"]
        for play in event["plays"]
        if play["team"] != team and play["action"][0] >= 0
    ]
    cycle = [
        [ALIASES[card], 4 - index, 4 - index]
        for index, card in enumerate(reversed(public_plays[-4:]))
    ]
    bodies = [row for row in state["entities"] if row[FIELDS["card_id"]] >= 0]
    theirs, ours = partition(lambda row: row[FIELDS["team"]] == team, bodies)

    def units(rows):
        return [
            [
                body(types[row[FIELDS["unit_type"]]]),
                *tile(row[FIELDS["x"]], row[FIELDS["y"]], team),
                "?",
            ]
            for row in rows
        ]

    effects = [
        [
            "blue" if row[0] == team else "red",
            ALIASES[row[1]],
            *tile(row[3], row[4], team),
            public_spell_age(observation, row),
        ]
        for row in state["spells"]
        if row[1] in (3, 6)
    ]
    return {
        "hand": [ALIASES[card] for card in own["hand"]],
        "elixir": round(own["elixir_milli"] / 1000, 1),
        "enemyElixir": {"min": enemy["elixir_range"][0], "max": enemy["elixir_range"][1]},
        "enemyCycle": cycle,
        "next": [ALIASES[own["next_card"]]],
        "own": sorted(units(ours), key=lambda row: -row[2])[:5],
        "enemy": sorted(units(theirs), key=lambda row: row[2])[:8],
        "effects": effects[:4],
        "skill": "ready" if own["abilities"] and own["abilities"][0][0] else "not_visible",
        "actions": [action_row(index, action, team) for index, action in enumerate(actions)],
        "clock": state["tick"] / 20,
        "towers": {"own": tower_fractions(own), "enemy": tower_fractions(enemy)},
    }
