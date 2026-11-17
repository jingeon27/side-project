"""Target-specific defensive value: unrelated damage cannot cover an urgent Drill."""

import math

from clash_bot.combat_projection import COMBAT

from ..catalogue import current
from .tactics_spec import SPEC

CATALOGUE = current()


def distance(x, y, body):
    return math.hypot(x - body["x"], y - body["y"])


def future(body):
    vx, vy = body["velocity"] or [0, 0]
    return {
        "x": body["x"] + vx * SPEC["responseSeconds"],
        "y": body["y"] + vy * SPEC["responseSeconds"],
    }


def responds(action, point):
    return max(
        0,
        1
        - distance(action[4], action[5], point)
        / (5 if action[2] == "ice_wizard" else SPEC["engagementRadius"]),
    )


def active(context, side, card, seconds):
    return [
        row
        for row in context.get("effects", [])
        if row[0] == side and row[1] == card and (row[4] is None or row[4] < seconds)
    ]


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
    poisons = active(context, "blue", "poison", 6)
    graves = [
        g
        for g in active(context, "red", "graveyard", 9)
        if g[3] < 16 and not any(math.hypot(p[2] - g[2], p[3] - g[3]) < 3 for p in poisons)
    ]
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
        return max(
            0,
            1
            - distance(action[4], action[5] + COMBAT["barbarian_barrel"]["length"], future(body))
            / SPEC["engagementRadius"],
        )

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
            return max(int(hit is not None and hit["trajectoryDamage"] > 0), intercept(body))
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

    grave_response = (
        0
        if action[2] in ("barbarian_barrel", "graveyard")
        else max([0, *(responds(action, {"x": g[2], "y": g[3]}) for g in graves)])
    )
    pending_response = (
        0
        if action[2] in ("graveyard", "poison", "barbarian_barrel", "skeletons")
        else max([0, *(responds(action, {"x": x, "y": y}) for x, y in deployments)])
    )
    pressure = max(
        [
            0,
            int(bool(graves)),
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
    return {
        "bias": SPEC["defenseWeight"] * (2 * benefit - pressure)
        + COMBAT["policy"]["drillKnightDefense"] * drill_knight
        + (COMBAT["policy"]["preEmergenceSkeletons"] if premature else 0)
        + (COMBAT["policy"]["unansweredDrill"] if unanswered_drill else 0),
        "intercept": max([0, *(intercept(b) for b, _, _ in threats)]),
        "usefulRoll": useful,
        "graveResponse": grave_response,
    }
