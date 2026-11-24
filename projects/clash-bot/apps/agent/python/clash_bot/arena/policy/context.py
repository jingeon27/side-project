"""Public decision context of one simulated position: the decision-v3 description the live screen also produces.

`clock` and `towers` are extra fields the text prompt does not serialize. The live screen sends the
clock and leaves `towers` out until tower hit points are read from the screen.
"""

import json
import math
from functools import cache

import numpy as np
from more_itertools import partition

from ..catalogue import current
from ..sim.rules import CARDS, FIELDS, TILE, canonical, new_battle

CATALOGUE = current()
# The screen's card names by engine catalogue id ("BarbLog" -> "barbarian_barrel").
NAMES = tuple(CATALOGUE.card_name(engine) for engine in CARDS)


@cache
def unit_types():
    return tuple(json.loads(new_battle().unit_types_json()))


def body(kind):
    """The screen's body name of an engine unit type; evolved and hero forms read as the base."""
    return CATALOGUE.catalogue.units.get(kind, "?")


def name(card):
    return NAMES[card] if card >= 0 else None


def tower_fractions(player, team=0):
    hp = np.asarray(player["tower_hp"], np.float64)
    normal = [round(float(value), 3) for value in hp / np.maximum(1, player["tower_max_hp"])]
    return [normal[0], normal[2], normal[1]] if team else normal


def fallen_princesses(player, team):
    return sorted(
        i if team == 0 else 1 - i for i, hp in enumerate(player["tower_hp"][1:3]) if hp == 0
    )


def tile(x, y, team):
    return [round(value, 1) for value in canonical(x / TILE, y / TILE, team)]


def action_row(index, action, team, player):
    match action.card:
        case -1:
            kind, card, cost = "wait", None, 0
        case -2:
            # [ready, ?, cost, card id, ?]: the hero card that owns the ability and its price.
            _ready, _state, cost, owner, *_rest = player["abilities"][0]
            kind, card = "ability", NAMES[owner]
        case played:
            kind, card = "card", NAMES[played]
            cost = (
                player["hand_costs"][player["hand"].index(played)]
                if CARDS[played] == "Mirror"
                else CATALOGUE.card(card).elixir
            )
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


def cycle_rows(cards):
    """[card, least, most] plays before each opponent card seen so far can return to hand.

    As the live tracker reports it (src/core/battle/card-cycle.ts): it always allows for plays it
    missed, so only the latest card is known to need four more plays; any earlier one may already
    be back.
    """
    if not cards:
        return []
    earlier = [card for card in dict.fromkeys(cards) if card != cards[-1]]
    return [*([NAMES[card], 0, 3] for card in earlier), [NAMES[cards[-1]], 4, 4]]


def decision_context(observation, actions, types=None):
    """The context with every public play recognized; `policy.screen` reads it as a real screen."""
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
    # The live ledger gives no lower bound and adds its 0.2 reading margin to the upper one.
    estimate = sum(enemy["elixir_range"]) / 2
    bodies = [row for row in state["entities"] if row[FIELDS["card_id"]] >= 0]
    theirs, ours = map(list, partition(lambda row: row[FIELDS["team"]] == team, bodies))

    def units(rows):
        return [
            [
                body(types[row[FIELDS["unit_type"]]]),
                *tile(row[FIELDS["x"]], row[FIELDS["y"]], team),
                "?",
            ]
            for row in rows
        ]

    def detailed(rows, reverse):
        result = []
        for row in sorted(
            rows,
            key=lambda entity: canonical(
                entity[FIELDS["x"]] / TILE, entity[FIELDS["y"]] / TILE, team
            )[1],
            reverse=reverse,
        ):
            uid = row[FIELDS["uid"]]
            # Motion over the last public snapshots, at most three seconds back.
            seen = [
                (tick, point)
                for tick, points in observation["trail"]
                if 0 < state["tick"] - tick <= 60
                for point in points
                if point[0] == uid
            ]
            old = max(seen, key=lambda value: value[0]) if seen else None
            x, y = row[FIELDS["x"]], row[FIELDS["y"]]
            point = tile(x, y, team)
            seconds = (state["tick"] - old[0]) / 20 if old else None
            direction = 1 if team == 0 else -1
            # Rounding both positions to tenths first loses most movement over short steps.
            velocity = (
                [
                    direction * (x - old[1][1]) / TILE / seconds,
                    direction * (y - old[1][2]) / TILE / seconds,
                ]
                if old and seconds
                else None
            )
            kind = body(types[row[FIELDS["unit_type"]]])
            # The screen reads a health bar, not hit points: the share of this unit's own full
            # health, scaled to the catalogue's reference. A unit's level cannot be read from it.
            full = CATALOGUE.catalogue.bodyHitpoints.get(kind) or row[FIELDS["max_hp"]]
            health = full * row[FIELDS["hp"]] / max(1, row[FIELDS["max_hp"]])
            result.append(
                {
                    "kind": kind,
                    "x": point[0],
                    "y": point[1],
                    "variant": "?",
                    "velocity": velocity,
                    "hp": [health, health],
                }
            )
        return result

    # Lingering areas only (poison, graveyard): the screen does not see a flying or rolling hit.
    effects = [
        [
            "blue" if row[0] == team else "red",
            NAMES[row[1]],
            *tile(row[3], row[4], team),
            public_spell_age(observation, row),
        ]
        for row in state["spells"]
        if CATALOGUE.lingering(NAMES[row[1]])
    ]
    return {
        "hand": [name(card) for card in own["hand"]],
        "elixir": round(own["elixir_milli"] / 1000, 1),
        "enemyElixir": {"min": 0.0, "max": min(10.0, estimate + 0.2)},
        "enemyCycle": cycle_rows(public_plays),
        "next": [NAMES[own["next_card"]]] if own["next_card"] >= 0 else [],
        # [card, count, ready, cycle]: normal plays left before the next evolved one.
        "ownEvolution": [
            [NAMES[card], 0 if ready else cycle - count, 0 if ready else cycle - count]
            for card, count, ready, cycle in own["evo"]
        ],
        "own": sorted(units(ours), key=lambda row: -row[2])[:5],
        "enemy": sorted(units(theirs), key=lambda row: row[2])[:8],
        "bodies": {"own": detailed(ours, True), "enemy": detailed(theirs, False)},
        # This adapter has not rendered/transcribed hostile deployment clocks.
        "deployments": [],
        "effects": effects[:4],
        "skill": "ready" if own["abilities"] and own["abilities"][0][0] else "not_visible",
        "actions": [action_row(index, action, team, own) for index, action in enumerate(actions)],
        "clock": state["tick"] / 20,
        "towers": {"own": tower_fractions(own, team), "enemy": tower_fractions(enemy, team)},
        "fallenTowers": {
            "own": fallen_princesses(own, team),
            "enemy": fallen_princesses(enemy, team),
        },
    }
