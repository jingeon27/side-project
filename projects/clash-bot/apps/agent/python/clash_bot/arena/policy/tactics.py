"""Mechanics offsets shared by native search, deployment and residual training."""

import math

import numpy as np

from clash_bot.combat_projection import COMBAT, forecast_effect

from ..placement import DEPLOYMENT
from .defense import fast_defense
from .position_bias import position_bias
from .tactics_spec import SPEC

POLICY = COMBAT["policy"]


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
    defense = fast_defense(context, action, projection)
    empty_roll = POLICY["reservedRoll"] if projection["reserveBarrel"] else POLICY["emptyRoll"]
    barrel = (
        (
            (empty_roll if not defense["usefulRoll"] and defense["intercept"] == 0 else 0)
            + SPEC["barbarianInterceptWeight"] * defense["intercept"]
        )
        if card == "barbarian_barrel"
        else 0
    )
    poison = (
        (
            (
                POLICY["emptyPoison"]
                if projection["trajectoryDamage"] == 0 and defense["graveResponse"] == 0
                else 0
            )
            + (
                POLICY["redundantPoison"]
                if any(
                    e[0] == "blue"
                    and e[1] == "poison"
                    and (e[4] is None or e[4] < 6)
                    and math.hypot(x - e[2], y - e[3]) < 3
                    for e in context.get("effects", [])
                )
                else 0
            )
        )
        if card == "poison"
        else 0
    )
    supported = any(
        b["kind"] in SPEC["supportCards"] and b["y"] >= 17 and abs(x - b["x"]) < 4.5
        for b in context["bodies"]["own"]
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
    return defense["bias"] + barrel + poison + graveyard + king + position_bias(context, action)


def action_biases(context):
    return np.array([action_bias(context, action) for action in context["actions"]], np.float32)
