"""Target-specific defensive value: unrelated damage cannot cover an urgent Drill."""

import math

from clash_bot.combat_motion import firecracker_recoil, recoil_position
from clash_bot.combat_projection import COMBAT, body_reference

from ..catalogue import current
from .graveyard import graveyard_defense
from .tactics_spec import SPEC
from .tower_pull import (
    already_pulled,
    chases_buildings,
    hog_threat,
    royal_giant_threat,
    standing_towers,
    tower_pull,
)

CATALOGUE = current()


def distance(x, y, body):
    return math.hypot(x - body["x"], y - body["y"])


def future(body, seconds=SPEC["responseSeconds"]):
    vx, vy = body["velocity"] or [0, 0]
    return {
        "x": body["x"] + vx * seconds,
        "y": body["y"] + vy * seconds,
    }


def responds(action, point):
    return max(
        0,
        1
        - distance(action[4], action[5], point)
        / (5 if action[2] == "ice_wizard" else SPEC["engagementRadius"]),
    )


def durable_firecracker(body):
    return body["kind"] == "firecracker" and (
        body["hp"] is None or body["hp"][1] > COMBAT["barbarian_barrel"]["damage"]
    )


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


def fast_defense(context, action, projection):
    # A visible spawner's timer does not undo its observed emergence.
    deployments = [
        (x, y)
        for x, y in context["deployments"]
        if not any(
            body["kind"] in ("goblin_drill", "goblin_hut") and distance(x, y, body) < 3
            for body in context["bodies"]["enemy"]
        )
    ]
    grave_pressure, grave_response = graveyard_defense(context, action)
    threats = []
    for index, body in enumerate(context["bodies"]["enemy"]):
        approach = future(body)
        siege = chases_buildings(body)
        siege_timing = hog_threat(body) or royal_giant_threat(body)
        if body["kind"] in ("barrel", "goblin_hut") or (
            approach["y"] >= SPEC["threatBoundary"] and not siege_timing
        ):
            continue
        if siege and already_pulled(context, approach):
            continue
        if (
            not siege
            and body["kind"] != "goblin_drill"
            and any(
                distance(own["x"], own["y"], body) < SPEC["engagementRadius"]
                for own in context["bodies"]["own"]
            )
        ):
            continue
        knight_cover = body["kind"] == "goblin_drill" and any(
            own["kind"] == "knight"
            and distance(own["x"], own["y"], body) < 2.5
            and (own["hp"] is None or own["hp"][1] > COMBAT["bodies"]["knight"]["hp"] * 0.15)
            for own in context["bodies"]["own"]
        )
        pressure = (
            SPEC["drillPriority"] * (0.35 if knight_cover else 1)
            if body["kind"] == "goblin_drill"
            else min(
                1, max(0.85 if siege_timing else 0, (SPEC["threatBoundary"] - approach["y"]) / 8)
            )
        )
        threats.append(
            (
                body,
                index,
                pressure,
                tower_pull(context, action, approach, body) if siege else 0,
                siege,
            )
        )

    def intercept(body):
        if body["kind"] == "goblin_drill":
            if any(distance(x, y, body) < 3.5 for x, y in deployments) or any(
                own["kind"] == "knight" and distance(own["x"], own["y"], body) < 2.5
                for own in context["bodies"]["own"]
            ):
                return 0
            return SPEC["drillBarbarianResponse"] * max(
                0,
                1
                - max(
                    0,
                    distance(action[4], action[5] + COMBAT["barbarian_barrel"]["length"], body)
                    - COMBAT["bodies"]["barbarian"]["speed"] * SPEC["responseSeconds"],
                )
                / SPEC["engagementRadius"],
            )
        if not (body_reference(body["kind"]) or {}).get("ground"):
            return 0
        roll = COMBAT["barbarian_barrel"]
        landing = (
            COMBAT["inputDelaySeconds"] + roll["deploySeconds"] + roll["length"] / roll["speed"]
        )
        target = future(body, landing)
        setup = COMBAT["firecrackerRecoil"]
        moved = recoil_position(
            (target["x"], target["y"]),
            landing,
            firecracker_recoil(
                body,
                [
                    *context["bodies"]["own"],
                    *standing_towers(context),
                ],
                setup,
            ),
            setup["windupSeconds"],
        )
        miss = max(
            distance(action[4], action[5] + roll["length"], target),
            distance(action[4], action[5] + roll["length"], {"x": moved[0], "y": moved[1]}),
        )
        catch = max(0, 1 - miss / SPEC["engagementRadius"])
        return catch * 0.4 if durable_firecracker(body) else catch

    useful = any(
        any(t[1] == hit["index"] for t in threats)
        and hit["trajectoryDamage"] > 0
        and (
            context["bodies"]["enemy"][hit["index"]]["kind"] != "goblin_drill"
            or (hit["hp"] is not None and hit["hp"][1] <= COMBAT["barbarian_barrel"]["damage"])
        )
        for hit in projection["targets"]
    )

    def direct_response(body, hit):
        if action[2] == "barbarian_barrel":
            if body["kind"] == "goblin_drill":
                cleanup = (
                    hit is not None
                    and hit["trajectoryDamage"] > 0
                    and hit["hp"] is not None
                    and hit["hp"][1] <= COMBAT["barbarian_barrel"]["damage"]
                )
                goblins = any(
                    child["trajectoryDamage"] > 0
                    and context["bodies"]["enemy"][child["index"]]["kind"] == "goblin"
                    and distance(body["x"], body["y"], context["bodies"]["enemy"][child["index"]])
                    < 3.5
                    for child in projection["targets"]
                )
                return 1 if cleanup or goblins else intercept(body)
            direct = int(hit is not None and hit["trajectoryDamage"] > 0)
            return max(direct * (0.35 if durable_firecracker(body) else 1), intercept(body))
        if action[2] == "poison":
            return (
                (0.9 if hit["kill"] == "yes" else 0.3)
                if hit is not None and hit["trajectoryDamage"] > 0
                else 0
            )
        if action[2] == "goblin_hut":
            return responds(action, future(body)) * 0.2
        return (
            responds(action, future(body))
            if action[2] != "graveyard" and can_respond(action[2], body)
            else 0
        )

    def response(body, index, pull, siege):
        card = CATALOGUE.catalogue.cards.get(action[2])
        if siege and card and card.placement == "building":
            return pull
        hit = next((h for h in projection["targets"] if h["index"] == index), None)
        value = direct_response(body, hit)
        return (
            value * SPEC["buildingPull"]["directResponseScale"]
            if siege and (not hit or hit["kill"] != "yes")
            else value
        )

    pending_response = (
        0
        if action[2] in ("graveyard", "poison", "barbarian_barrel", "skeletons")
        else max([0, *(responds(action, {"x": x, "y": y}) for x, y in deployments)])
    )
    pressure = max(
        [
            0,
            grave_pressure,
            SPEC["deploymentPriority"] if deployments else 0,
            *(p for _, _, p, _, _ in threats),
        ]
    )
    hunter_knight = max(
        (
            responds(action, future(body, COMBAT["inputDelaySeconds"] + 1))
            for body in context["bodies"]["enemy"]
            if action[2] == "knight"
            and body["kind"] == "hunter"
            and body["y"] <= 18
            and any(
                royal_giant_threat(siege)
                and distance(body["x"], body["y"], siege)
                <= SPEC["royalGiantPull"]["hunterDistance"]
                for siege in context["bodies"]["enemy"]
            )
        ),
        default=0,
    )
    benefit = max(
        [
            0,
            grave_response,
            hunter_knight,
            pending_response * SPEC["deploymentPriority"],
            *(p * response(b, i, pull, siege) for b, i, p, pull, siege in threats),
        ]
    )
    drill_knight = (
        max(
            [
                0,
                *(
                    responds(action, b)
                    for b, *_ in threats
                    if b["kind"] == "goblin_drill"
                    and not any(
                        o["kind"] == "knight" and distance(o["x"], o["y"], b) < 2.5
                        for o in context["bodies"]["own"]
                    )
                ),
            ]
        )
        if action[2] == "knight"
        else 0
    )
    premature = action[2] == "skeletons" and any(
        distance(action[4], action[5], {"x": x, "y": y}) < 4 for x, y in deployments
    )
    unanswered_drill = any(
        body["kind"] == "goblin_drill"
        and urgency >= SPEC["drillPriority"]
        and response(body, index, pull, siege) < 0.2
        for body, index, urgency, pull, siege in threats
    ) or (bool(deployments) and pending_response < 0.2)
    contact = 0.0
    if action[2] == "barbarian_barrel" and not unanswered_drill:
        for body, index, urgency, _, _ in threats:
            hit = next((row for row in projection["targets"] if row["index"] == index), None)
            if hit is not None and not durable_firecracker(body):
                # A hit on a surviving target is more useful if the Barbarian can follow it up.
                lethal = (
                    hit["hp"] is not None and hit["hp"][1] <= COMBAT["barbarian_barrel"]["damage"]
                )
                followup = 1 if lethal else max(0.2, intercept(body))
                contact = max(contact, min(1, urgency) * hit["trajectoryQuality"] * followup)
    return {
        "bias": SPEC["defenseWeight"] * (2 * benefit - pressure)
        + SPEC["barrelContactWeight"] * contact
        + SPEC["buildingPull"]["weight"] * max([0, *(p * pull for _, _, p, pull, _ in threats)])
        + SPEC["royalGiantPull"]["knightResponseBonus"] * hunter_knight
        + COMBAT["policy"]["drillKnightDefense"] * drill_knight
        + (COMBAT["policy"]["preEmergenceSkeletons"] if premature else 0)
        + (COMBAT["policy"]["unansweredDrill"] if unanswered_drill else 0),
        "intercept": max([0, *(intercept(b) for b, *_ in threats)])
        if action[2] == "barbarian_barrel"
        else 0,
        "usefulRoll": useful,
        "graveResponse": grave_response,
        "drillKnight": drill_knight,
        "benefit": benefit,
        "unansweredDrill": unanswered_drill,
        "siegePull": max(
            (
                pull
                for body, _, _, pull, _ in threats
                if hog_threat(body) or royal_giant_threat(body)
            ),
            default=0,
        ),
    }
