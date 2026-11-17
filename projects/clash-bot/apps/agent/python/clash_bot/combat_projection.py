"""Shared, pure damage projections from public motion and visible health only."""

import json
import math

from clash_bot.paths import CONTRACTS_DIR

COMBAT = json.loads((CONTRACTS_DIR / "combat-projection.json").read_text())
EFFECTS = json.loads((CONTRACTS_DIR / "placement-effects.json").read_text())
for card in ("ice_wizard", "barbarian_barrel", "poison"):
    COMBAT[card] = {**EFFECTS[card], **COMBAT[card]}


def rounded(value):
    return math.floor(value * 10 + 0.5) / 10


def poison_position(unit, time, x, y, delay):
    if unit["velocity"] is None:
        return unit["x"], unit["y"]
    vx, vy = unit["velocity"]
    a = vx * vx + vy * vy
    b = 2 * ((unit["x"] - x) * vx + (unit["y"] - y) * vy)
    c = (unit["x"] - x) ** 2 + (unit["y"] - y) ** 2 - COMBAT["poison"]["radius"] ** 2
    discriminant = b * b - 4 * a * c
    if a == 0 or discriminant < 0:
        return unit["x"] + vx * time, unit["y"] + vy * time
    enter = max(delay, (-b - math.sqrt(discriminant)) / (2 * a))
    exit = (-b + math.sqrt(discriminant)) / (2 * a)
    if exit <= enter or time <= enter:
        return unit["x"] + vx * time, unit["y"] + vy * time
    until = enter + (exit - enter) / COMBAT["poison"]["slowMultiplier"]
    travel = (
        enter + (time - enter) * COMBAT["poison"]["slowMultiplier"]
        if time <= until
        else exit + time - until
    )
    return unit["x"] + vx * travel, unit["y"] + vy * travel


def screen_body(unit, river, reflected=False):
    kind = unit.get("kind") or unit.get("card") or "?"
    y = 2 * river - unit["y"] if reflected else unit["y"]
    x = 368 - unit["x"] if reflected else unit["x"]
    point = [rounded(9 + (x - 184) * 11 / 178), rounded(16 - (y - river) * 9.5 / 130)]
    motion, velocity = unit.get("motion"), unit.get("velocity")
    tracked = bool(motion and velocity and motion["samples"] >= 2 and motion["elapsedMs"] >= 100)
    reference, health = COMBAT["bodies"].get(kind), unit.get("health")
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
        if reference and health
        else None,
    }


def forecast_effect(card, kind, x, y, own, enemy, enemy_cycle, enemy_mana):
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
    for index, unit in enumerate(enemy):
        if unit["kind"] == "barrel":
            continue
        reference = COMBAT["bodies"].get(unit["kind"])
        if card == "barbarian_barrel" and not (reference and reference["ground"]):
            continue
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
                delay + i * COMBAT["stepSeconds"]
                for i in range(math.ceil(duration / COMBAT["stepSeconds"]) + 1)
            ]
        )
        hits = []
        for time in times:
            velocity = unit["velocity"] or [0, 0]
            px, py = unit["x"] + velocity[0] * time, unit["y"] + velocity[1] * time
            if card == "poison":
                px, py = poison_position(unit, time, x, y, delay)
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
                dx, dy = (
                    abs(px - x) - COMBAT[card]["width"] / 2,
                    abs(py - roll_y) - COMBAT[card]["width"] / 2,
                )
                hits.append(
                    [
                        dx + uncertainty <= 0 and dy + uncertainty <= 0,
                        dx - uncertainty <= 0 and dy - uncertainty <= 0,
                    ]
                )
                continue
            radius = COMBAT[card]["radius"]
            points = (
                [(px, py), (unit["x"] + velocity[0] * time, unit["y"] + velocity[1] * time)]
                if card == "poison"
                else [(px, py)]
            )
            hits.append(
                [
                    all(math.hypot(ax - x, ay - y) + uncertainty <= radius for ax, ay in points),
                    any(math.hypot(ax - x, ay - y) - uncertainty <= radius for ax, ay in points),
                ]
            )
        central = []
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
            velocity = unit["velocity"] or [0, 0]
            px, py = unit["x"] + velocity[0] * time, unit["y"] + velocity[1] * time
            if card == "poison":
                px, py = poison_position(unit, time, x, y, delay)
            if card == "barbarian_barrel":
                central.append(
                    abs(px - x) <= COMBAT[card]["width"] / 2
                    and abs(py - y - (time - delay) * COMBAT[card]["speed"])
                    <= COMBAT[card]["width"] / 2
                )
                continue
            central.append(math.hypot(px - x, py - y) <= COMBAT[card]["radius"])
        trajectory_damage = (
            min(8, math.floor(sum(central) * COMBAT["stepSeconds"] / COMBAT[card]["tickSeconds"]))
            * COMBAT[card]["dps"]
            if card == "poison"
            else COMBAT[card]["damage"]
            if any(central)
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
