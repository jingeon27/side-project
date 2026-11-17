"""Declared mechanics offsets, identical in search, live inference and residual training.

These are priors, not learned skill. Every legal card/position and waiting remain available.
"""

import json
import math

import numpy as np

from clash_bot.combat_projection import COMBAT, forecast_effect
from clash_bot.paths import CONTRACTS_DIR

from ..catalogue import current
from ..placement import DEPLOYMENT

SPEC = json.loads((CONTRACTS_DIR / "fast-tactics.json").read_text())
POLICY = COMBAT["policy"]
CATALOGUE = current()


def distance(x, y, body):
    return math.hypot(x - body["x"], y - body["y"])


def future(body):
    velocity = body["velocity"] or [0, 0]
    return {
        "x": body["x"] + velocity[0] * SPEC["responseSeconds"],
        "y": body["y"] + velocity[1] * SPEC["responseSeconds"],
    }


def can_respond(card, body):
    features = CATALOGUE.cards.get(card)
    if features is None:
        return False
    names = CATALOGUE.catalogue.cardFeatures
    if features[names.index("spell")] == 1:
        return True
    flying = (
        CATALOGUE.body_vector(body["kind"])[CATALOGUE.catalogue.bodyFeatures.index("flying")] == 1
    )
    return features[names.index("airTargets" if flying else "groundTargets")] > 0


def active(context, side, card, seconds):
    return [
        row
        for row in context.get("effects", [])
        if row[0] == side and row[1] == card and (row[4] is None or row[4] < seconds)
    ]


def counter_availability(context):
    def possible(card, cost):
        if context["enemyElixir"]["max"] < cost:
            return 0
        observed = next((row for row in context.get("enemyCycle", []) if row[0] == card), None)
        if observed is None:
            return POLICY["unknownCounterWeight"]
        if observed[1] > 0:
            return 0
        return 1 if observed[2] == 0 else POLICY["uncertainCounterWeight"]

    return max(possible(card, cost) for card, cost in SPEC["graveyardCounters"].items())


def action_bias(context, action):
    _letter, kind, card, cost, x, y = action
    if kind == "wait":
        return 0
    projection = forecast_effect(
        card,
        kind,
        x,
        y,
        context["bodies"]["own"],
        context["bodies"]["enemy"],
        context.get("enemyCycle", []),
        context["enemyElixir"],
    )
    if kind == "ability":
        return POLICY["noObservedSkillOpportunity"] if projection["opportunity"] == 0 else 0
    poisons = active(context, "blue", "poison", 6)
    graves = [
        row
        for row in active(context, "red", "graveyard", 9)
        if row[3] < 16 and not any(math.hypot(p[2] - row[2], p[3] - row[3]) < 3 for p in poisons)
    ]
    threats = [
        body
        for body in context["bodies"]["enemy"]
        if body["kind"] not in ("barrel", "goblin_hut")
        and future(body)["y"] < SPEC["threatBoundary"]
        and not any(
            distance(own["x"], own["y"], body) < SPEC["engagementRadius"]
            for own in context["bodies"]["own"]
        )
    ]
    responds = lambda body: max(
        0, 1 - distance(x, y, body) / (5 if card == "ice_wizard" else SPEC["engagementRadius"])
    )
    grave_response = max([0, *(responds({"x": row[2], "y": row[3]}) for row in graves)])
    troop_response = max(
        [0, *(responds(future(body)) for body in threats if can_respond(card, body))]
    )
    intercept = (
        max(
            [
                0,
                *(
                    max(
                        0,
                        1
                        - distance(x, y + COMBAT["barbarian_barrel"]["length"], future(body))
                        / SPEC["engagementRadius"],
                    )
                    for body in threats
                    if COMBAT["bodies"].get(body["kind"], {}).get("ground")
                ),
            ]
        )
        if card == "barbarian_barrel"
        else 0
    )
    response = (
        0
        if card == "graveyard"
        else max(int(projection["opportunity"] > 0), intercept)
        if card == "barbarian_barrel"
        else max(troop_response if projection["opportunity"] > 0 else 0, grave_response)
        if card == "poison"
        else max(troop_response, grave_response)
    )
    pressure = max(
        [
            int(bool(graves)),
            *(min(1, max(0, (SPEC["threatBoundary"] - future(body)["y"]) / 8)) for body in threats),
        ]
    )
    defense = SPEC["defenseWeight"] * pressure * (2 * response - 1)
    barrel = (
        (
            (POLICY["reservedRoll"] if projection["reserveBarrel"] else POLICY["emptyRoll"])
            if projection["opportunity"] == 0 and intercept == 0
            else 0
        )
        + SPEC["barbarianInterceptWeight"] * intercept
        if card == "barbarian_barrel"
        else 0
    )
    poison = (
        (
            (
                POLICY["emptyPoison"]
                if projection["trajectoryDamage"] == 0 and grave_response == 0
                else 0
            )
            + (
                POLICY["redundantPoison"]
                if any(math.hypot(x - p[2], y - p[3]) < 3 for p in poisons)
                else 0
            )
        )
        if card == "poison"
        else 0
    )
    supported = any(
        body["kind"] in SPEC["supportCards"] and body["y"] >= 17 and abs(x - body["x"]) < 4.5
        for body in context["bodies"]["own"]
    )
    followup = "poison" in context["hand"] and context["elixir"] >= 9
    graveyard = (
        (
            (
                POLICY["unsupportedGraveyard"] * counter_availability(context)
                if not supported and not followup
                else 0
            )
            + (
                POLICY["defenseReserve"]
                if context["elixir"] - cost < SPEC["reserveElixir"]
                and context["enemyElixir"]["max"] >= 3
                else 0
            )
        )
        if card == "graveyard"
        else 0
    )
    towers = context.get("towers")
    king_active = towers and (towers["enemy"][0] < 1 or 0 in towers["enemy"][1:])
    radius = COMBAT["poison"]["radius"] if card == "poison" else POLICY["graveyardSpawnRadius"]
    king = (
        POLICY["kingDamage"]
        if card in ("graveyard", "poison")
        and not king_active
        and math.hypot(
            x - (18 - DEPLOYMENT.kingTowerTile[0]), y - (32 - DEPLOYMENT.kingTowerTile[1])
        )
        <= radius + POLICY["kingFootprintRadius"]
        else 0
    )
    return defense + barrel + poison + graveyard + king


def action_biases(context):
    return np.array([action_bias(context, action) for action in context["actions"]], np.float32)
