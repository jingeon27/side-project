"""Shared, pure damage projections from public motion and visible health only."""

import json
import math

from clash_bot.combat_motion import (
    catalogue_body_reference,
    firecracker_recoil,
    motion_position,
    poison_position,
    recoil_position,
)
from clash_bot.paths import CONTRACTS_DIR

COMBAT = json.loads((CONTRACTS_DIR / "combat-projection.json").read_text())
EFFECTS = json.loads((CONTRACTS_DIR / "placement-effects.json").read_text())
for card in ("ice_wizard", "barbarian_barrel", "poison"):
    COMBAT[card] = {**EFFECTS[card], **COMBAT[card]}


def rounded(value):
    return math.floor(value * 10 + 0.5) / 10


def body_reference(kind):
    return COMBAT["bodies"].get(kind) or catalogue_body_reference(kind)


def screen_body(unit, river, reflected=False):
    kind = unit.get("kind") or unit.get("card") or "?"
    y = 2 * river - unit["y"] if reflected else unit["y"]
    x = 368 - unit["x"] if reflected else unit["x"]
    point = [rounded(9 + (x - 184) * 11 / 178), rounded(16 - (y - river) * 9.5 / 130)]
    motion, velocity = unit.get("motion"), unit.get("velocity")
    tracked = bool(motion and velocity and motion["samples"] >= 2 and motion["elapsedMs"] >= 100)
    reference, health = body_reference(kind), unit.get("health")
    return {
        "kind": kind,
        "x": point[0],
        "y": point[1],
        "variant": unit.get("variant", "unknown"),
        "velocity": [
            velocity["xPerSecond"] * 11 / 178 * (-1 if reflected else 1),
            velocity["yPerSecond"] * 9.5 / 130 * (1 if reflected else -1),
        ]
        if tracked
        else None,
        "hp": [
            math.floor(reference["hp"] * health["minFraction"]),
            math.ceil(reference["hp"] * health["maxFraction"]),
        ]
        if reference and reference["hp"] and health
        else None,
    }


def forecast_effect(card, kind, x, y, own, enemy, enemy_cycle, enemy_mana, own_towers=()):
    reserve = (
        any(name == "goblin_barrel" and low == 0 for name, low, _ in enemy_cycle)
        and enemy_mana["max"] >= 3
    )
    opportunity = (
        sum(
            any(
                unit["kind"] == "ice_wizard"
                and math.hypot(unit["x"] - target["x"], unit["y"] - target["y"])
                <= COMBAT["ability"]["markRange"]
                for unit in own
            )
            for target in enemy
            if target["kind"] != "barrel"
        )
        if kind == "ability"
        else 0
    )
    result = {
        "basis": "reference_motion_projection",
        "damage": [0, 0],
        "exposureSeconds": [0, 0],
        "kills": [0, 0],
        "unknownHealth": 0,
        "opportunity": opportunity,
        "reserveBarrel": reserve,
        "trajectoryDamage": 0,
        "targets": [],
    }
    if kind == "ability" or card not in ("ice_wizard", "barbarian_barrel", "poison"):
        return result
    shot_targets = [*own, *own_towers]
    for index, unit in enumerate(enemy):
        if unit["kind"] == "barrel":
            continue
        reference = body_reference(unit["kind"])
        if card == "barbarian_barrel" and not (reference and reference["ground"]):
            continue
        recoil_spec = COMBAT["firecrackerRecoil"]
        roll_half_width = COMBAT["barbarian_barrel"]["width"] / 2 + (
            recoil_spec["lateralBodyPadding"] if unit["kind"] == "firecracker" else 0
        )
        recoil = firecracker_recoil(unit, shot_targets, recoil_spec)
        delay = COMBAT["inputDelaySeconds"] + COMBAT[card]["deploySeconds"]
        duration = (
            COMBAT["poison"]["duration"]
            if card == "poison"
            else COMBAT["barbarian_barrel"]["length"] / COMBAT["barbarian_barrel"]["speed"]
        )
        times = (
            [delay]
            if card == "ice_wizard"
            else [
                delay + min(duration, i * COMBAT["stepSeconds"])
                for i in range(math.ceil(duration / COMBAT["stepSeconds"]) + 1)
            ]
        )
        hits = []
        for time in times:
            linear = motion_position(unit, time)
            point = (
                poison_position(unit, time, x, y, delay, COMBAT[card])
                if card == "poison"
                else linear
            )
            points = (
                (point, recoil_position(point, time, recoil, recoil_spec["windupSeconds"]))
                if recoil
                else (point,)
            )
            speed = reference["speed"] if reference else 2
            uncertainty = (
                COMBAT["positionUncertaintyTiles"]
                + time
                * (
                    (
                        0
                        if reference and reference["speed"] == 0
                        else COMBAT["turnUncertaintyTilesPerSecond"]
                    )
                    if unit["velocity"] is not None
                    else speed
                )
                + COMBAT["inputDelayUncertainty"] * math.hypot(*(unit["velocity"] or [speed, 0]))
            )
            if card == "barbarian_barrel":
                roll_y = y + (time - delay) * COMBAT[card]["speed"]
                contacts = [
                    (
                        abs(px - x) - roll_half_width,
                        abs(py - roll_y) - COMBAT[card]["depth"] / 2,
                    )
                    for px, py in points
                ]
                hits.append(
                    [
                        all(dx + uncertainty <= 0 and dy + uncertainty <= 0 for dx, dy in contacts),
                        any(dx - uncertainty <= 0 and dy - uncertainty <= 0 for dx, dy in contacts),
                    ]
                )
                continue
            radius = COMBAT[card]["radius"]
            if card == "poison":
                points = (*points, linear)
            hits.append(
                [
                    all(math.hypot(ax - x, ay - y) + uncertainty <= radius for ax, ay in points),
                    any(math.hypot(ax - x, ay - y) - uncertainty <= radius for ax, ay in points),
                ]
            )
        central = []
        paths = 2 if recoil else 1
        roll_hit, best_quality = [False] * paths, [0.0] * paths
        for time in times:
            if (
                card == "poison"
                and (not reference or reference["speed"] != 0)
                and (
                    unit["velocity"] is None
                    or time > delay + COMBAT["poison"]["trajectoryHorizonSeconds"]
                )
            ):
                central.append(False)
                continue
            point = (
                poison_position(unit, time, x, y, delay, COMBAT[card])
                if card == "poison"
                else motion_position(unit, time)
            )
            points = (
                (point, recoil_position(point, time, recoil, recoil_spec["windupSeconds"]))
                if recoil
                else (point,)
            )
            if card == "barbarian_barrel":
                width, depth = roll_half_width, COMBAT[card]["depth"] / 2
                for path, (px, py) in enumerate(points):
                    cross = abs(px - x) / width
                    along = abs(py - y - (time - delay) * COMBAT[card]["speed"]) / depth
                    roll_hit[path] |= cross <= 1 and along <= 1
                    quality = (
                        max(0, 1 - cross)
                        * max(0, 1 - along)
                        * (1 - 0.25 * (time - delay) / duration)
                    )
                    best_quality[path] = max(best_quality[path], quality)
                continue
            central.append(
                all(math.hypot(px - x, py - y) <= COMBAT[card]["radius"] for px, py in points)
            )
        trajectory_damage = (
            min(8, math.floor(sum(central) * COMBAT["stepSeconds"] / COMBAT[card]["tickSeconds"]))
            * COMBAT[card]["dps"]
            if card == "poison"
            else COMBAT[card]["damage"]
            if (all(roll_hit) if card == "barbarian_barrel" else any(central))
            else 0
        )
        exposure = (
            [min(8, sum(hit[column] for hit in hits) * COMBAT["stepSeconds"]) for column in (0, 1)]
            if card == "poison"
            else [0, 0]
        )
        damage = (
            [
                math.floor(exposure[0] / COMBAT[card]["tickSeconds"]) * COMBAT[card]["dps"],
                min(8, math.ceil(exposure[1] / COMBAT[card]["tickSeconds"])) * COMBAT[card]["dps"],
            ]
            if card == "poison"
            else [
                COMBAT[card]["damage"] if any(hit[column] for hit in hits) else 0
                for column in (0, 1)
            ]
        )
        if unit["kind"] == "knight" and unit["variant"] != "base":
            damage[0] = math.floor(damage[0] * 0.4)
        if damage[1] == 0:
            continue
        hp = unit["hp"]
        kill = (
            "unknown"
            if hp is None
            else "yes"
            if damage[0] >= hp[1]
            else "no"
            if damage[1] < hp[0]
            else "possible"
        )
        actual = [min(damage[0], hp[0]), min(damage[1], hp[1])] if hp else [0, damage[1]]
        result["targets"].append(
            {
                "index": index,
                "damage": actual,
                "potentialDamage": damage,
                "exposureSeconds": [rounded(value) for value in exposure],
                "hp": hp,
                "kill": kill,
                "trajectoryDamage": trajectory_damage,
                "trajectoryQuality": min(best_quality),
            }
        )
    targets = result["targets"]
    result.update(
        damage=[sum(row["damage"][index] for row in targets) for index in (0, 1)],
        exposureSeconds=[
            rounded(sum(row["exposureSeconds"][index] for row in targets)) for index in (0, 1)
        ],
        kills=[
            sum(row["kill"] == "yes" for row in targets),
            sum(row["kill"] in ("yes", "possible") for row in targets),
        ],
        unknownHealth=sum(row["kill"] == "unknown" for row in targets),
        opportunity=sum(row["trajectoryDamage"] > 0 for row in targets),
        trajectoryDamage=sum(row["trajectoryDamage"] for row in targets),
    )
    return result


def forecast_text(forecast, kind, card):
    if kind == "ability":
        return f"q{forecast['opportunity']}"
    if card not in ("ice_wizard", "barbarian_barrel", "poison"):
        return ""
    number = lambda value: format(value, ".10g")
    interval = lambda pair: (
        number(pair[0]) if pair[0] == pair[1] else f"{number(pair[0])}-{number(pair[1])}"
    )
    text = (
        "z"
        if forecast["damage"][1] == 0
        else f"d{interval(forecast['damage'])}k{interval(forecast['kills'])}"
        + ("?" if forecast["unknownHealth"] else "")
    )
    if card == "poison" and forecast["damage"][1] > 0:
        text += f"e{interval(forecast['exposureSeconds'])}"
    if card == "barbarian_barrel":
        text += f"q{forecast['opportunity']}r{int(forecast['reserveBarrel'])}"
    if card == "poison":
        text += f"n{forecast['trajectoryDamage']}"
    return text
