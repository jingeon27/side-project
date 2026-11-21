"""Target-specific defensive value: unrelated damage cannot cover an urgent Drill."""

import math

from clash_bot.combat_projection import COMBAT

from ..catalogue import current
from .graveyard import graveyard_defense
from .tactics_spec import SPEC

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
        if body["kind"] in ("barrel", "goblin_hut") or future(body)["y"] >= SPEC["threatBoundary"]:
            continue
        if body["kind"] != "goblin_drill" and any(
            distance(own["x"], own["y"], body) < SPEC["engagementRadius"]
            for own in context["bodies"]["own"]
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
            else min(1, max(0, (SPEC["threatBoundary"] - future(body)["y"]) / 8))
        )
        threats.append((body, index, pressure))

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
        if not COMBAT["bodies"].get(body["kind"], {}).get("ground"):
            return 0
        roll = COMBAT["barbarian_barrel"]
        landing = (
            COMBAT["inputDelaySeconds"] + roll["deploySeconds"] + roll["length"] / roll["speed"]
        )
        catch = max(
            0,
            1
            - distance(action[4], action[5] + roll["length"], future(body, landing))
            / SPEC["engagementRadius"],
        )
        return catch * 0.4 if durable_firecracker(body) else catch

    useful = any(
        hit["trajectoryDamage"] > 0
        and (
            context["bodies"]["enemy"][hit["index"]]["kind"] != "goblin_drill"
            or (hit["hp"] is not None and hit["hp"][1] <= COMBAT["barbarian_barrel"]["damage"])
        )
        for hit in projection["targets"]
    )

    def response(body, index):
        hit = next((h for h in projection["targets"] if h["index"] == index), None)
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
            *(p for _, _, p in threats),
        ]
    )
    benefit = max(
        [
            0,
            grave_response,
            pending_response * SPEC["deploymentPriority"],
            *(p * response(b, i) for b, i, p in threats),
        ]
    )
    drill_knight = (
        max(
            [
                0,
                *(
                    responds(action, b)
                    for b, _, _ in threats
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
        and response(body, index) < 0.2
        for body, index, urgency in threats
    ) or (bool(deployments) and pending_response < 0.2)
    contact = 0.0
    if action[2] == "barbarian_barrel" and not unanswered_drill:
        for body, index, urgency in threats:
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
        + COMBAT["policy"]["drillKnightDefense"] * drill_knight
        + (COMBAT["policy"]["preEmergenceSkeletons"] if premature else 0)
        + (COMBAT["policy"]["unansweredDrill"] if unanswered_drill else 0),
        "intercept": max([0, *(intercept(b) for b, _, _ in threats)]),
        "usefulRoll": useful,
        "graveResponse": grave_response,
    }
