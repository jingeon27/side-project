"""Public motion for placement forecasts, including a single observed-target shot scenario."""

import json
import math
from functools import cache

from clash_bot.paths import CONTRACTS_DIR

CATALOGUE = json.loads((CONTRACTS_DIR / "card-catalogue.json").read_bytes())
TAGS = CATALOGUE["bodyFeatures"]


@cache
def catalogue_body_reference(kind):
    traits = CATALOGUE["bodies"].get(kind)
    if kind == "?" or traits is None or traits[TAGS.index("effect")] > 0:
        return None
    return {
        "ground": traits[TAGS.index("flying")] == 0,
        "speed": 2 * traits[TAGS.index("speed")],
        "hp": CATALOGUE["bodyHitpoints"].get(kind),
    }


def motion_position(body, seconds):
    vx, vy = body["velocity"] or (0, 0)
    return body["x"] + vx * seconds, body["y"] + vy * seconds


def possible_princess_towers(health=(), fallen=()):
    return [
        {"x": x, "y": 6.5}
        for i, x in enumerate((3.5, 14.5), 1)
        if i - 1 not in fallen and (i >= len(health) or health[i] != 0)
    ]


def poison_position(unit, time, x, y, delay, poison):
    if unit["velocity"] is None:
        return motion_position(unit, time)
    vx, vy = unit["velocity"]
    a = vx * vx + vy * vy
    b = 2 * ((unit["x"] - x) * vx + (unit["y"] - y) * vy)
    c = (unit["x"] - x) ** 2 + (unit["y"] - y) ** 2 - poison["radius"] ** 2
    discriminant = b * b - 4 * a * c
    if a == 0 or discriminant < 0:
        return motion_position(unit, time)
    enter = max(delay, (-b - math.sqrt(discriminant)) / (2 * a))
    exit_time = (-b + math.sqrt(discriminant)) / (2 * a)
    if exit_time <= enter or time <= enter:
        return motion_position(unit, time)
    until = enter + (exit_time - enter) / poison["slowMultiplier"]
    travel = (
        enter + (time - enter) * poison["slowMultiplier"]
        if time <= until
        else exit_time + time - until
    )
    return motion_position(unit, travel)


def firecracker_recoil(unit, targets, setup):
    if unit["kind"] != "firecracker" or not targets:
        return None
    x, y = motion_position(unit, setup["windupSeconds"])
    target = min(targets, key=lambda target: math.hypot(x - target["x"], y - target["y"]))
    dx, dy = x - target["x"], y - target["y"]
    distance = math.hypot(dx, dy)
    if not 0 < distance <= setup["attackRangeTiles"]:
        return None
    return dx * setup["distanceTiles"] / distance, dy * setup["distanceTiles"] / distance


def recoil_position(point, seconds, recoil, windup):
    if recoil is None or seconds < windup:
        return point
    return (
        min(17.5, max(0.5, point[0] + recoil[0])),
        min(31.5, max(0.5, point[1] + recoil[1])),
    )
