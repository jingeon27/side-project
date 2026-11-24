"""An offensive Graveyard window and an optional Poison response as the same push develops."""

import math
from dataclasses import dataclass

from clash_bot.combat_projection import COMBAT

from ..catalogue import current
from ..placement import DEPLOYMENT, pocket_tiles
from .tactics_spec import SPEC

ATTACK = SPEC["graveyardAttack"]
CATALOGUE = current()
BUILDING = CATALOGUE.catalogue.bodyFeatures.index("building")


@dataclass(frozen=True)
class GraveyardPlan:
    safe: bool
    drill_control: bool
    poison_ready: bool
    combo_cost: int
    funding: bool
    tanks: list[dict]
    cycle_plays: int
    fallen: dict
    double: bool
    two_crown: bool
    witch_hold: bool
    witch_absent: bool


def graveyard_plan(context):
    own = context["bodies"]["own"]
    enemy = context["bodies"]["enemy"]
    cycle = context.get("enemyCycle", ())
    seen = {body["kind"] for body in enemy} | {row[0] for row in cycle}
    standing = [body for body in enemy if body["y"] < 17]
    safe = (
        not context["deployments"]
        and not any(
            e[0] == "red" and e[1] == "graveyard" and e[3] < 16 for e in context.get("effects", ())
        )
        and not any(
            body["kind"] == "goblin_drill"
            or (
                CATALOGUE.body_vector(body["kind"])[BUILDING] != 1
                and (body["kind"] not in SPEC["fragileBodies"] or body["y"] <= 10)
            )
            for body in standing
        )
        and sum(body["kind"] in SPEC["fragileBodies"] for body in standing) < 2
    )
    fallen = context.get("fallenTowers") or {
        side: [i for i, hp in enumerate(context.get("towers", {}).get(side, ())[1:3]) if hp == 0]
        for side in ("own", "enemy")
    }
    double = context.get("clock", 0) >= ATTACK["doubleElixirAt"]
    two_crown = len(fallen["own"]) == len(fallen["enemy"]) == 1
    witch_absent = any(card == "witch_mother" and low > 0 for card, low, _ in cycle)
    witch_hold = any(body["kind"] == "witch_mother" for body in enemy) or (
        "witch_mother" in seen and not witch_absent
    )
    drill_control = (
        "goblin_drill" in seen
        and not any(
            card != "goblin_drill"
            and (card in ATTACK["heavyThreats"] or card in ATTACK["primaryAttacks"])
            for card in seen
        )
        and any(card in context["hand"] for card in ATTACK["drillAnswers"])
    )
    primary = [card for card in seen if card in ATTACK["primaryAttacks"]]
    cycle_plays = (
        next((row[1] for row in cycle if row[0] == primary[0]), 0)
        if safe
        and len({row[0] for row in cycle}) >= ATTACK["cycleMinimumKnown"]
        and len(primary) == 1
        and primary[0] not in ATTACK["heavyThreats"]
        else 0
    )
    tanks = [
        body
        for body in own
        if body["kind"] in SPEC["supportCards"] and body["y"] >= ATTACK["tankMinY"]
    ]
    poison_ready = "poison" in context["hand"]
    combo_cost = sum(CATALOGUE.catalogue.cards[card].elixir for card in ("graveyard", "poison"))
    funding = (
        safe
        and not witch_hold
        and (drill_control or tanks or double)
        and poison_ready
        and "graveyard" in context["hand"]
        and ATTACK["fundFromElixir"] <= context["elixir"] < combo_cost
    )
    return GraveyardPlan(
        safe,
        drill_control,
        poison_ready,
        combo_cost,
        bool(funding),
        tanks,
        cycle_plays,
        fallen,
        double,
        two_crown,
        witch_hold,
        witch_absent,
    )


def pocket_knight(context, action, plan):
    if action[2] != "knight" or not plan.safe or not plan.two_crown or plan.witch_hold:
        return 0
    x, y = action[4:6]
    if not any(math.hypot(px - x, py - y) <= 0.8 for px, py in pocket_tiles(plan.fallen["enemy"])):
        return 0
    followup = any(
        side == "blue"
        and card == "graveyard"
        and gy >= 23
        and abs(gx - 9) <= 3
        and age is not None
        and age <= 5
        for side, card, gx, gy, age in context.get("effects", ())
    )
    funded = (
        "graveyard" in context["hand"]
        and context["elixir"] >= action[3] + 5
        and not any(math.hypot(unit["x"] - x, unit["y"] - y) < 4 for unit in plan.tanks)
    )
    return ATTACK["pocketKnightBonus"] if followup or funded else 0


def graveyard_attack(context, action, projection, plan):
    card, x, y = action[2], action[4], action[5]
    if card not in ("graveyard", "poison"):
        return (0, False, False, False, False, False)
    princesses = [lane for i, lane in enumerate((3.5, 14.5)) if i not in plan.fallen["enemy"]]
    king_distance = math.hypot(
        x - (18 - DEPLOYMENT.kingTowerTile[0]), y - (32 - DEPLOYMENT.kingTowerTile[1])
    )
    central = plan.two_crown and abs(x - 9) <= 3 and y >= 23
    crown_distance = min(
        [
            *(math.hypot(x - lane, y - 25.5) for lane in princesses),
            king_distance if not princesses or central else math.inf,
        ]
    )
    tank = any(
        abs(unit["x"] - x) < 4.5 and (central or (unit["x"] < 9) == (x < 9)) for unit in plan.tanks
    )
    effects = context.get("effects", ())
    own_poison = any(
        side == "blue"
        and spell == "poison"
        and (age is None or age < 6)
        and math.hypot(x - px, y - py) < 4
        for side, spell, px, py, age in effects
    )
    followup = (
        card == "poison"
        and plan.safe
        and not own_poison
        and crown_distance <= COMBAT["poison"]["radius"]
        and any(
            side == "blue"
            and spell == "graveyard"
            and gy >= 22
            and age is not None
            and age <= ATTACK["poisonLastAge"]
            and math.hypot(x - gx, y - gy) <= 2.5
            and (
                projection["trajectoryDamage"] > 0
                or any(
                    math.hypot(unit["x"] - gx, unit["y"] - gy) <= 3.5
                    for unit in context["bodies"]["enemy"]
                )
            )
            for side, spell, gx, gy, age in effects
        )
    )
    crown_target = crown_distance <= COMBAT["policy"]["graveyardSpawnRadius"] - 0.5
    opening = card == "graveyard" and plan.safe and crown_target and not plan.witch_hold
    combo = (
        opening
        and plan.poison_ready
        and context["elixir"] >= plan.combo_cost
        and (tank or plan.drill_control)
    )
    support = opening and tank
    bonus = (
        (ATTACK["comboBonus"] if combo else 0)
        + (ATTACK["supportedAttackBonus"] if support else 0)
        + (
            ATTACK["doubleAttackBonus"]
            if opening and plan.double and (tank or context["elixir"] >= 8)
            else 0
        )
        + (ATTACK["pocketKnightBonus"] if opening and central and tank else 0)
        + (ATTACK["motherWitchWindowBonus"] if opening and plan.witch_absent else 0)
        + (
            ATTACK["cycleAttackBonus"]
            if opening and plan.cycle_plays >= ATTACK["cycleMinimumPlays"]
            else 0
        )
        + (ATTACK["poisonFollowupBonus"] if followup else 0)
    )
    return (bonus, combo, support, followup, followup and plan.drill_control, crown_target)
