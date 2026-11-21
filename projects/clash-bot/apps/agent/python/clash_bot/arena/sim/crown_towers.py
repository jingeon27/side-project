"""Check native crown-tower level ladders, first fire, damage and the King's wake triggers."""

import json

from ..catalogue import current
from .attack_timing import observe_attacks
from .mechanics import STATIONARY_TARGET, TICK_MS, field
from .rules import FIELDS as F
from .rules import SPEC, pinned_table


def king_activation(cause):
    tower_hp = None
    if cause == "princessLost":
        tower_hp = [p["tower_max_hp"] for p in json.loads(field().state_json())["players"]]
        tower_hp[0][1] = 1
    target = {
        "undamaged": (STATIONARY_TARGET, 1, 9, 8, 30000),
        "kingDamaged": ("Knight", 1, 9, 6, 30000),
        "princessLost": ("Knight", 1, 3.5, 8, 30000),
    }[cause]
    battle = field(units=[target], tower_hp=tower_hp, start_tick=0)
    trigger = active = fire = None
    for tick in range(100):
        state = json.loads(battle.state_json())
        player = state["players"][0]
        hp = player["tower_hp"]
        if trigger is None and (hp[0] < player["tower_max_hp"][0] or hp[1] == 0):
            trigger = tick * TICK_MS
        if active is None and player["king_active"]:
            active = tick * TICK_MS
        king = next(r for r in state["entities"] if r[F["team"]] == 0 and r[F["tower_slot"]] == 0)
        if king[F["attack_phase"]] == 2:
            fire = tick * TICK_MS
            break
        battle.step([], 1)
    return {"triggerMs": trigger, "activeMs": active, "firstReleaseMs": fire}


def knight_at_tower(starting_hp):
    battle = field(units=[("Knight", 1, 3.5, 10, starting_hp)], start_tick=0)
    initial = json.loads(battle.state_json())
    knight = next(
        r[F["uid"]] for r in initial["entities"] if r[F["team"]] == 1 and r[F["tower_slot"]] == -1
    )
    shots = 0
    for tick in range(1, 65):
        battle.step([], 1)
        state = json.loads(battle.state_json())
        entities = state["entities"]
        shots += sum(
            r[F["team"]] == 0
            and r[F["tower_slot"]] == 1
            and r[F["target_uid"]] == knight
            and r[F["attack_phase"]] == 2
            for r in entities
        )
        if not any(r[F["uid"]] == knight for r in entities):
            return {
                "knightStartingHp": starting_hp,
                "knightDeathMs": tick * TICK_MS,
                "towerShots": shots,
                "towerHpLost": initial["players"][0]["tower_hp"][1]
                - state["players"][0]["tower_hp"][1],
            }
    raise ValueError("Knight survived the tower defense scenario")


def crown_tower_combat():
    raw = {row["name"]: row for row in pinned_table()["towers"]}
    ids = {"PrincessTower": "princess_tower", "KingTower": "king_tower"}
    levels = {label: {} for label in ids.values()}
    passed = True
    for level in range(1, raw["KingTower"]["level_scaling"]["level_count"] + 1):
        pair = [level, level]
        princess = field(units=[(STATIONARY_TARGET, 1, 3.5, 11, 30000)], tower_levels=pair)
        players = json.loads(princess.state_json())["players"]
        full = players[0]["tower_max_hp"]
        passed &= (
            all(p["tower_hp"] == p["tower_max_hp"] == full for p in players) and full[1] == full[2]
        )
        # No Princess Tower can contribute damage in the awakened King's field.
        king = field(
            units=[(STATIONARY_TARGET, 1, 9, 8, 30000)],
            tower_levels=pair,
            tower_hp=[[full[0], 0, 0], full],
            king_wake_ms=[6000, -1],
        )
        for name, battle, slot in (("PrincessTower", princess, 1), ("KingTower", king, 0)):
            row = raw[name]
            sample = observe_attacks(battle, name, slot)
            sample.update(maxHp=full[slot], attackRangeTiles=row["range_milli"] / 1000)
            series = levels[ids[name]]
            previous = series.get(str(level - 1))
            passed &= (
                sample["firstReleaseMs"] == row["hit_speed_ms"] - row["load_time_ms"]
                and sample["releaseIntervalMs"] == sample["impactIntervalMs"] == row["hit_speed_ms"]
                and sample["firstImpactMs"] > sample["firstReleaseMs"]
                and sample["damagePerHit"][0] == sample["damagePerHit"][1] > 0
                and (
                    not previous
                    or (
                        sample["maxHp"] > previous["maxHp"]
                        and sample["damagePerHit"][0] > previous["damagePerHit"][0]
                    )
                )
            )
            series[str(level)] = sample
    reference = current().catalogue.bodyHitpoints
    passed &= all(
        reference[k] == series[str(SPEC["level"])]["maxHp"] for k, series in levels.items()
    )
    activation = {
        cause: king_activation(cause) for cause in ("undamaged", "kingDamaged", "princessLost")
    }
    passed &= all(v is None for v in activation["undamaged"].values())
    for cause in ("kingDamaged", "princessLost"):
        times = activation[cause]
        passed &= (
            all(v is not None for v in times.values())
            and times["triggerMs"] < times["activeMs"] < times["firstReleaseMs"]
        )
    damage = levels["princess_tower"][str(SPEC["level"])]["damagePerHit"][0]
    mortal, survivor = knight_at_tower(damage), knight_at_tower(damage + 1)
    passed &= (
        mortal["towerShots"] == 1
        and mortal["towerHpLost"] == 0
        and survivor["towerShots"] == 2
        and survivor["towerHpLost"] > 0
    )
    return {
        "passed": passed,
        "byTower": levels,
        "kingActivation": activation,
        "approachingKnight": {
            "oneShot": mortal,
            "survivesFirstShot": survivor,
            "startingDistanceTiles": 3.5,
        },
    }
