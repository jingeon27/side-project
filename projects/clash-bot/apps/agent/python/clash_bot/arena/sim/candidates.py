"""Candidate plays the engine accepts: the placement-rule tiles search expands and the full
grid the policy ranks. The tiles themselves come from `arena.placement`."""

import json
from functools import cache

import royalesim

from ..catalogue import current
from ..placement import placement_grid, placement_tiles
from .rules import CARDS, FIELDS, TILE, Action, canonical


@cache
def placements():
    """Each battle card's placement rule from the card catalogue, by battle catalogue id."""
    lookup = current()
    return [lookup.card(lookup.card_name(card)).placement for card in CARDS]


def threat_and_targets(state, team):
    """The enemy unit nearest our king's row, if one is in our half, and every enemy unit."""
    x, y, owner, card = (FIELDS[name] for name in ("x", "y", "team", "card_id"))
    targets = [
        canonical(row[x] / TILE, row[y] / TILE, team)
        for row in state["entities"]
        if row[card] >= 0 and row[owner] != team
    ]
    threat = min((point for point in targets if point[1] < 16), key=lambda p: p[1], default=None)
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
