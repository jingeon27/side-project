"""Rate visible building pulls by the crown-tower coverage they can create."""

import math

from clash_bot.combat_motion import possible_princess_towers
from clash_bot.combat_projection import COMBAT

from ..catalogue import current
from .tactics_spec import SPEC

CATALOGUE = current()
TAGS = CATALOGUE.catalogue.bodyFeatures


def chases_buildings(body):
    traits = CATALOGUE.body_vector(body["kind"])
    return traits[TAGS.index("buildingTargets")] == 1 and traits[TAGS.index("speed")] > 0


def hog_threat(body):
    return body["kind"] in ("hog_rider", "royal_hog") and body["y"] <= SPEC["hogPull"]["triggerY"]


def royal_giant_threat(body):
    return body["kind"] == "royal_giant" and body["y"] <= SPEC["royalGiantPull"]["triggerY"]


def standing_towers(context):
    return possible_princess_towers(
        context.get("towers", {}).get("own", ()), context.get("fallenTowers", {}).get("own", ())
    )


def towers_covering(context, x, y):
    return sum(
        math.hypot(t["x"] - x, t["y"] - y) <= SPEC["buildingPull"]["towerRange"]
        for t in standing_towers(context)
    )


def siege_arrival(body, standing, spec):
    if not standing:
        return None
    tower = min(standing, key=lambda t: math.hypot(t["x"] - body["x"], t["y"] - body["y"]))
    dx, dy = tower["x"] - body["x"], tower["y"] - body["y"]
    distance = math.hypot(dx, dy)
    travel = spec["speed"] * (COMBAT["inputDelaySeconds"] + SPEC["hogPull"]["deploySeconds"])
    if distance <= travel + spec["towerContact"] + SPEC["hogPull"]["distanceMargin"]:
        return None
    return {"x": body["x"] + dx * travel / distance, "y": body["y"] + dy * travel / distance}


def pull_value(context, approach, x, y):
    if not 6.5 < y < 16:
        return 0
    standing = standing_towers(context)
    if not standing:
        return 0
    distance = math.hypot(x - approach["x"], y - approach["y"])
    if distance >= min(
        math.hypot(t["x"] - approach["x"], t["y"] - approach["y"]) for t in standing
    ):
        return 0
    spec = SPEC["buildingPull"]
    firing = towers_covering(context, x, y)
    if not firing:
        return 0
    return max(0, 1 - distance / spec["maxDistance"]) * (
        1 if firing == 2 else spec["oneTowerCoverage"]
    )


def already_pulled(context, approach):
    return any(
        CATALOGUE.body_vector(body["kind"])[TAGS.index("building")] == 1
        and pull_value(context, approach, body["x"], body["y"]) >= 0.4
        for body in context["bodies"]["own"]
    )


def tower_pull(context, action, approach, body):
    card = CATALOGUE.catalogue.cards.get(action[2])
    if not card or card.placement != "building":
        return 0
    x, y = action[4:6]
    if body["kind"] not in ("hog_rider", "royal_hog", "royal_giant"):
        return pull_value(context, approach, x, y)
    spec = SPEC["hogPull"]
    if (
        not (hog_threat(body) or royal_giant_threat(body))
        or abs(x - 9) > spec["centerWidth"]
        or not spec["minY"] <= y <= spec["maxY"]
    ):
        return 0
    standing = standing_towers(context)
    stats = spec if hog_threat(body) else SPEC["royalGiantPull"]
    if body["kind"] == "royal_hog":
        stats = {"speed": spec["speed"], "towerContact": spec["royalHogTowerContact"]}
    ready = siege_arrival(body, standing, stats)
    if ready is None:
        return 0
    distance = math.hypot(x - ready["x"], y - ready["y"])
    if distance + spec["distanceMargin"] >= min(
        math.hypot(tower["x"] - ready["x"], tower["y"] - ready["y"]) for tower in standing
    ):
        return 0
    cover = pull_value(context, ready, x, y)
    return 0.4 + 0.6 * cover if cover > 0 else 0
