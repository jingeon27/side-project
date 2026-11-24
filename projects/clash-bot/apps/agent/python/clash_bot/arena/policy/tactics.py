"""Mechanics offsets shared by native search, deployment and residual training."""

import math

import numpy as np

from clash_bot.combat_projection import COMBAT, forecast_effect

from ..catalogue import current
from ..placement import DEPLOYMENT
from .defense import fast_defense
from .defensive_spending import opening_ice_wizard_has_value, worthwhile_barrel
from .graveyard_attack import graveyard_attack, graveyard_plan, pocket_knight
from .position_bias import position_bias
from .tactics_spec import SPEC
from .tower_pull import hog_threat, royal_giant_threat, standing_towers, towers_covering

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


def is_troop(card):
    item = current().catalogue.cards.get(card)
    return item is not None and item.placement in ("troop", "ranged_troop")


def placement_advice(context, action, defense, projection, crown_target, plan):
    advice = SPEC["placementAdvice"]
    _letter, _kind, card, _cost, x, y = action
    if (
        card == "graveyard"
        and not crown_target
        and defense["graveResponse"] == 0
        and sum(
            math.hypot(body["x"] - x, body["y"] - y) <= POLICY["graveyardSpawnRadius"]
            for body in context["bodies"]["enemy"]
        )
        < 2
    ):
        return -advice["emptyGraveyard"]
    if card == "graveyard" and crown_target and not plan.two_crown and not plan.witch_hold:
        lane = 0 if x < 9 else 1
        if lane in plan.fallen["enemy"]:
            return 0
        outside_x = 2.5 if lane == 0 else 15.5
        return advice["graveyardOutsideCrown"] * max(
            0, 1 - math.hypot(x - outside_x, y - 25.5) / 1.5
        )
    if (
        card == "barbarian_barrel"
        and projection["trajectoryDamage"] == 0
        and defense["intercept"] < 0.3
    ):
        return -advice["emptyBarrel"]
    if card == "knight" and defense["drillKnight"] > 0:
        return advice["drillKnight"] * defense["drillKnight"]
    if (
        is_troop(card)
        and defense["unansweredDrill"]
        and any(
            body["kind"] == "goblin_drill" and body["y"] < 16 for body in context["bodies"]["enemy"]
        )
    ):
        return -advice["drillKnight"]
    if defense["siegePull"] > 0:
        return advice["timelyBuildingPull"] * defense["siegePull"]
    if card == "goblin_hut" and defense["benefit"] == 0:
        if y < 6.5:
            return -advice["inactiveRearHut"]
        if len(plan.fallen["own"]) < 2 and not towers_covering(context, x, y):
            return -advice["uncoveredHut"]
    return 0


def compress(score):
    return SPEC["priorLimit"] * math.tanh(score / SPEC["priorScoreScale"])


def action_bias(context, action, plan):
    _letter, kind, card, cost, x, y = action
    if kind == "wait":
        return 0, 0
    projection = forecast_effect(
        card,
        kind,
        x,
        y,
        context["bodies"]["own"],
        context["bodies"]["enemy"],
        context.get("enemyCycle", []),
        context["enemyElixir"],
        standing_towers(context),
    )
    if kind == "ability":
        return compress(
            POLICY["noObservedSkillOpportunity"] if projection["opportunity"] == 0 else 0
        ), 0
    defense = fast_defense(context, action, projection)
    urgent = defense["benefit"] >= SPEC["urgentDefenseValue"]
    bonus, combo, support, followup_bonus, flexible_reserve, crown_target = graveyard_attack(
        context, action, projection, plan
    )
    pocket = pocket_knight(context, action, plan)
    risky_placement = (
        (
            card == "goblin_hut"
            and not defense["siegePull"]
            and any(
                hog_threat(unit) or royal_giant_threat(unit) for unit in context["bodies"]["enemy"]
            )
        )
        or (card == "ice_wizard" and not opening_ice_wizard_has_value(context, action, projection))
        or (
            card == "barbarian_barrel"
            and not worthwhile_barrel(context, action, projection, defense)
        )
    )
    spends_combo_elixir = plan.funding and card != "graveyard" and not urgent and not pocket
    empty_roll = POLICY["reservedRoll"] if projection["reserveBarrel"] else POLICY["emptyRoll"]
    barrel = (
        (
            (
                empty_roll
                if (
                    (not defense["usefulRoll"] and defense["intercept"] < 0.35)
                    or (
                        projection["reserveBarrel"]
                        and defense["benefit"] < SPEC["urgentDefenseValue"]
                    )
                )
                else 0
            )
            + SPEC["barbarianInterceptWeight"] * defense["intercept"]
        )
        if card == "barbarian_barrel"
        else 0
    )
    poison = (
        (
            (
                POLICY["emptyPoison"]
                if projection["trajectoryDamage"] == 0
                and defense["graveResponse"] == 0
                and not followup_bonus
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
    after_spend = context["elixir"] - cost
    attack_spec = SPEC["graveyardAttack"]
    cycle_window = (
        card == "graveyard"
        and crown_target
        and plan.cycle_plays >= attack_spec["cycleMinimumPlays"]
        and (after_spend >= 1 or plan.cycle_plays >= attack_spec["cycleEmptyReservePlays"])
    )
    risky_followup = (
        flexible_reserve
        and after_spend < attack_spec["comboReserve"]
        and not urgent
        and context["enemyElixir"]["max"] > SPEC["poorEnemyElixirMax"]
        and plan.cycle_plays < attack_spec["cycleMinimumPlays"]
    )
    graveyard = (
        POLICY["unsupportedGraveyard"] * counter_availability(context)
        if card == "graveyard" and not supported and not followup and not combo and not support
        else 0
    )
    pressure_window = cycle_window or (
        context["enemyElixir"]["max"] <= SPEC["poorEnemyElixirMax"]
        and (
            (card == "graveyard" and y >= 22 and 1 <= x <= 17)
            or (supported and y >= 12 and card in ("knight", "ice_wizard"))
        )
    )
    risky_graveyard = card == "graveyard" and (
        (y >= 16 and plan.witch_hold)
        or (
            not urgent
            and (not crown_target or (after_spend < SPEC["reserveElixir"] and not pressure_window))
        )
    )
    overextended_graveyard = (
        card == "graveyard"
        and not urgent
        and not pressure_window
        and not support
        and after_spend < attack_spec["comboReserve"]
    )
    clock = context.get("clock")
    unsupported_opening_graveyard = (
        card == "graveyard"
        and crown_target
        and not urgent
        and not pressure_window
        and not support
        and not followup
        and clock is not None
        and clock < attack_spec["openingSeconds"]
    )
    risk = (
        SPEC["riskyPlayPenalty"]
        if risky_placement or spends_combo_elixir or risky_followup or risky_graveyard
        else 0
    )
    reserve = (
        0
        if urgent or pressure_window
        else SPEC["reservePerMissingElixir"]
        * max(
            0,
            (SPEC["graveyardAttack"]["comboReserve"] if flexible_reserve else SPEC["reserveElixir"])
            - (context["elixir"] - cost),
        )
    )
    towers = context.get("towers")
    king_active = bool(plan.fallen["enemy"]) or (
        towers and (towers["enemy"][0] < 1 or 0 in towers["enemy"][1:])
    )
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
    score = (
        compress(
            defense["bias"]
            + barrel
            + poison
            + graveyard
            + bonus
            + pocket
            + king
            + position_bias(context, action)
            - reserve
            - risk
        )
        + placement_advice(context, action, defense, projection, crown_target, plan)
        - (SPEC["unsupportedGraveyardSpendCost"] if overextended_graveyard else 0)
        - (SPEC["unsupportedOpeningGraveyardCost"] if unsupported_opening_graveyard else 0)
    )
    return score, defense["siegePull"]


def action_biases(context):
    plan = graveyard_plan(context)
    affordable_troop = context["elixir"] >= 10 and any(
        kind == "card" and cost <= 4 and is_troop(card)
        for _letter, kind, card, cost, *_tile in context["actions"]
    )
    moves = [action_bias(context, action, plan) for action in context["actions"]]
    wait_cost = max(
        SPEC["fullElixirWaitCost"] if affordable_troop else 0,
        SPEC["timelyBuildingWaitCost"] * max((pull for _, pull in moves), default=0),
    )
    return np.array(
        [
            -wait_cost if action[1] == "wait" else score
            for action, (score, _) in zip(context["actions"], moves, strict=True)
        ],
        np.float32,
    )
