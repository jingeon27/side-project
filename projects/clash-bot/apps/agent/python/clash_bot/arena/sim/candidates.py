"""Candidate plays: the placement-rule tiles search expands and the full grid the policy ranks.

src/core/fast/candidates.ts builds the same tiles in the same order for the live screen.
"""

import json
from functools import cache

import royalesim

from ..catalogue import current
from .rules import CARDS, DEPLOYMENT, FIELDS, TILE, Action, canonical


@cache
def placements():
    """Each battle card's placement rule from the card catalogue, by battle catalogue id."""
    lookup = current()
    return [lookup.card(lookup.card_name(card)).placement for card in CARDS]


LANES = [(3.5, 10), (14.5, 10), (3.5, 14), (14.5, 14), *DEPLOYMENT.kingBackTiles]
ENEMY_TOWERS = [(3.5, 25.5), (14.5, 25.5)]


def placement_tiles(placement, threat, targets):
    """Up to six own-frame tiles per card; src/core/fast/candidates.ts has the same rules."""
    match placement:
        case "spawn_spell":  # Graveyard: centre / outer / forward in both lanes
            points = [
                (x + dx, y)
                for x in (3.5, 14.5)
                for dx, y in ((0, 25.5), (-0.8 if x < 9 else 0.8, 25), (0, 24.5))
            ]
        case "area_spell":
            points = ([threat] if threat else []) + targets[:3] + ENEMY_TOWERS
        case "building":
            points = [(9, 9), (7, 12), (11, 12), (3.5, 10), (14.5, 10), (9, 6)]
        case "troop" | "ranged_troop" | "rolling_spell":
            points = list(LANES)
            if threat:
                x, y = threat
                gap = 3 if placement == "ranged_troop" else 1
                points[:2] = [
                    (max(0.6, min(17.4, x)), max(1, min(15, y - gap))),
                    (9, max(2, min(13, y - 1))),
                ]
        case "tower_spell":
            points = [*ENEMY_TOWERS, (3.5, 23.5), (14.5, 23.5)]
        case "anywhere":
            points = ([threat] if threat else []) + [
                (3.5, 22.5),
                (14.5, 22.5),
                (3.5, 28.5),
                (14.5, 28.5),
            ]
        case _:
            points = []
    return points[:6]


# Every own-side tile for a deployed card, and every second tile of the field for a spell, on
# top of the placement rule's tiles. The policy ranks them all; search takes its best few.
OWN_GRID = [(x + 0.5, y + 0.5) for y in range(15) for x in range(18)]
FIELD_GRID = [(x, y) for y in range(1, 32, 2) for x in range(1, 18, 2)]


def placement_grid(placement, targets):
    """src/core/fast/candidates.ts builds the same grid in the same order."""
    match placement:
        case "troop" | "ranged_troop" | "building" | "rolling_spell":
            return OWN_GRID
        case "area_spell" | "spawn_spell" | "tower_spell" | "anywhere":
            return [*targets, *FIELD_GRID]
        case _:
            return []


def threat_and_targets(state, team):
    units = [
        dict(zip(royalesim.ENTITY_FIELDS, row))
        for row in state["entities"]
        if row[FIELDS["card_id"]] >= 0
    ]
    invaders = [
        unit
        for unit in units
        if unit["team"] != team and canonical(unit["x"] / TILE, unit["y"] / TILE, team)[1] < 16
    ]
    nearest = min(
        invaders,
        key=lambda unit: canonical(unit["x"] / TILE, unit["y"] / TILE, team)[1],
        default=None,
    )
    threat = canonical(nearest["x"] / TILE, nearest["y"] / TILE, team) if nearest else None
    targets = [
        canonical(unit["x"] / TILE, unit["y"] / TILE, team)
        for unit in units
        if unit["team"] != team
    ]
    return threat, targets


def candidate_actions(battle, team, tiles, state=None):
    state = state or json.loads(battle.state_json())
    player = state["players"][team]
    threat, targets = threat_and_targets(state, team)
    actions, seen = [Action(-1)], {Action(-1)}
    for card in player["hand"]:
        if card < 0:
            continue
        for x, y in tiles(placements()[card], threat, targets):
            x, y = canonical(x, y, team)
            action = Action(card, round(x * TILE), round(y * TILE))
            if action in seen:
                continue
            if battle.check_deploy(team, player["hand"].index(card), action.x, action.y) == 0:
                actions.append(action)
                seen.add(action)
    if battle.check_deploy(team, royalesim.HAND_SIZE, 0, 0) == 0:
        actions.append(Action(-2))
    return actions


def dense_actions(battle, team, state=None):
    """The decision's full candidate set: placement-rule tiles, then the grid."""
    return candidate_actions(
        battle,
        team,
        lambda placement, threat, targets: [
            *placement_tiles(placement, threat, targets),
            *placement_grid(placement, targets),
        ],
        state,
    )


def legal_actions(battle, team, state=None):
    """The placement-rule tiles only: the small set search expands below the root."""
    return candidate_actions(battle, team, placement_tiles, state)
