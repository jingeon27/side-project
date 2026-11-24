"""Estimate the tactical value of forwarding Ice Wizard and spending Barbarian Barrel."""

import math

from clash_bot.combat_motion import motion_position
from clash_bot.combat_projection import COMBAT

from .tactics_spec import SPEC


def opening_ice_wizard_has_value(context, action, projection):
    opening = SPEC["iceWizardOpening"]
    if context.get("clock", 0) >= opening["seconds"] or action[5] < opening["frontY"]:
        return True
    contacts = [target for target in projection["targets"] if target["trajectoryDamage"] > 0]
    delay = COMBAT["inputDelaySeconds"] + COMBAT["ice_wizard"]["deploySeconds"]
    return len(contacts) >= 2 or any(
        motion_position(context["bodies"]["enemy"][target["index"]], delay)[1] <= opening["urgentY"]
        for target in contacts
    )


def worthwhile_barrel(context, action, projection, defense):
    urgent = defense["benefit"] >= SPEC["urgentDefenseValue"]
    if projection["reserveBarrel"] and not urgent:
        return False
    x, y = action[4:6]
    enemy = context["bodies"]["enemy"]
    hits = [
        (target, enemy[target["index"]])
        for target in projection["targets"]
        if target["trajectoryDamage"] > 0
    ]
    roll = COMBAT["barbarian_barrel"]
    end = y + roll["length"]
    drills = [body for body in enemy if body["kind"] == "goblin_drill" and body["y"] < 16]
    if any(
        drill["y"] > y
        and abs(drill["x"] - x) <= roll["width"] / 2 + COMBAT["positionUncertaintyTiles"]
        and math.hypot(drill["x"] - x, drill["y"] - end) <= 2.25
        and defense["intercept"] >= 0.35
        for drill in drills
    ):
        return True
    if defense["unansweredDrill"] and not any(
        math.hypot(body["x"] - drill["x"], body["y"] - drill["y"]) <= 3.5
        for _, body in hits
        for drill in drills
    ):
        return False
    if len(hits) >= 2:
        return True
    hp = context.get("towers", {}).get("own", ())
    threatened = [
        lane for i, lane in enumerate((3.5, 14.5), 1) if i < len(hp) and 0 < hp[i] <= 0.12
    ]

    def matters(target, body):
        lethal = target["hp"] is not None and target["hp"][1] <= roll["damage"]
        if body["kind"] == "goblin_drill":
            return lethal
        if body["kind"] == "firecracker":
            return lethal or defense["intercept"] >= 0.3
        if body["kind"] in SPEC["fragileBodies"]:
            return (
                any(
                    e[0] == "red"
                    and e[1] == "graveyard"
                    and math.hypot(body["x"] - e[2], body["y"] - e[3])
                    <= COMBAT["policy"]["graveyardSpawnRadius"]
                    for e in context.get("effects", ())
                )
                or any(
                    math.hypot(body["x"] - drill["x"], body["y"] - drill["y"]) <= 3.5
                    for drill in drills
                )
                or any(math.hypot(body["x"] - lane, body["y"] - 6.5) <= 2.5 for lane in threatened)
            )
        return defense["usefulRoll"] and (urgent or lethal)

    return any(matters(target, body) for target, body in hits)
