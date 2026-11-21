"""Controlled fields for activation, building pulls, wave timing and destruction spawns."""

import json
from collections import Counter

from clash_bot.paths import CONTRACTS_DIR

from .mechanics import STATIONARY_TARGET, bodies, field
from .rules import FIELDS as F


def births(units, ticks, **options):
    battle = field(units=units, start_tick=0, **options)
    initial = bodies(battle)
    seen = {r[F["uid"]] for _, r in initial}
    parents = {r[F["uid"]]: name for name, r in initial}
    born, died = [], {}
    for tick in range(1, ticks + 1):
        battle.step([], 1)
        rows = bodies(battle)
        live = {r[F["uid"]] for _, r in rows}
        for name, r in rows:
            if r[F["uid"]] not in seen and r[F["team"]] == 0:
                born.append((tick, name))
        for uid in parents.keys() - live:
            died.setdefault(parents[uid], tick)
        seen.update(live)
    return born, died


def hut_activation():
    reach = json.loads((CONTRACTS_DIR / "hut-activation.json").read_bytes())["centerReachByBody"]
    cases = {}
    hut = ("GoblinHut_Rework", 0, 4, 12, -1)
    for name, body, inside, outside in (
        ("Knight", "knight", 7.45, 7.55),
        ("Minions", "minion", 7.45, 7.55),
        ("Cannon", "cannon", 7.8, 7.9),
        ("Cannon_EV1", "cannon", 7.8, 7.9),
        ("Tombstone", "tombstone", 8.2, 8.3),
    ):
        for gap in (inside, outside):
            children, _ = births([hut, (name, 1, 4 + gap, 12, -1)], 22, unit_deploy_ticks=[0, 40])
            ticks = [t for t, child in children if child == "SpearGoblin_Dummy"]
            expected = gap == inside
            cases[f"{name}/{gap}"] = {
                "firstSpawnTick": next(iter(ticks), None),
                "passed": bool(ticks) == expected and (gap <= reach[body]) == expected,
            }
    empty, _ = births([hut], 90)
    friendly, _ = births([hut, ("Knight", 0, 4.5, 12, -1)], 90)
    crowns, _ = births([("GoblinHut_Rework", 0, 3.5, 20, -1)], 40)
    # A cannon wakes the hut, then disappears. No new wave follows through two normal intervals.
    triggered, deaths = births(
        [("GoblinHut_Rework", 0, 4, 14, -1), ("Cannon", 1, 11.7, 14, 75)], 140
    )
    death = deaths.get("Cannon")
    awake = [t for t, name in triggered if name == "SpearGoblin_Dummy"]
    return {
        "passed": all(c["passed"] for c in cases.values())
        and not (empty or friendly or crowns)
        and bool(awake)
        and death is not None
        and max(awake) < death
        and "GoblinHut_Rework" not in deaths,
        "byTargetAndCenterGap": cases,
        "spawnsWithoutEnemy": len(empty),
        "spawnsWithOnlyAlly": len(friendly),
        "spawnsWithOnlyEnemyTowers": len(crowns),
        "targetLost": {"waveTicks": awake, "targetDiedTick": death, "observedUntilTick": 140},
    }


def spawner_waves():
    cases = {}
    for name, child, ticks, expected in (
        ("Tombstone", "Skeleton", 92, [1, 10, 80, 90]),
        ("BarbarianHut", "Barbarian", 322, [1, 10, 20, 300, 310, 320]),
        ("Furnace_rework", "FireSpirits", 145, [39, 139]),
    ):
        events, _ = births([(name, 0, 9, 13, -1)], ticks)
        waves = [t for t, n in events if n == child]
        cases[name] = {"child": child, "birthTicks": waves, "passed": waves == expected}
    destroyed = {}
    for parent, child, count in (
        ("GoblinHut_Rework", "SpearGoblin", 1),
        ("Tombstone", "Skeleton", 4),
        ("BarbarianHut", "Barbarian", 1),
        ("GoblinCage", "GoblinBrawler", 1),
        ("GoblinDrill", "Goblin", 2),
    ):
        normal, _ = births([(parent, 0, 9, 13, -1)], 5)
        low, deaths = births([(parent, 0, 9, 13, 1)], 5)
        tick = deaths[parent]
        extra = Counter(low)[tick, child] - Counter(normal)[tick, child]
        destroyed[parent] = {
            "child": child,
            "deathTick": tick,
            "additionalSpawns": extra,
            "passed": extra == count,
        }
    return {
        "passed": all(r["passed"] for r in (*cases.values(), *destroyed.values())),
        "periodic": cases,
        "onDeath": destroyed,
    }


def building_targeting():
    rows = {}
    for defense, intruder, gap, expected in (
        ("Cannon", "Knight", 5, True),
        ("Cannon", "Knight", 9, False),
        ("Cannon", "Minions", 5, False),
        ("InfernoTower", "Minions", 5, True),
        ("Mortar", "Knight", 1.8, False),
        ("Mortar", "Knight", 9, True),
        ("Xbow", "Minions", 9, False),
        ("Xbow", "Knight", 9, True),
    ):
        battle = field(units=[(defense, 0, 3, 14, -1), (intruder, 1, 3 + gap, 14, -1)])
        battle.step([], 1)
        entities = bodies(battle)
        defender = next(r for n, r in entities if n == defense)
        target = next(r for _, r in entities if r[F["team"]] == 1)
        acquired = defender[F["target_uid"]] == target[F["uid"]]
        rows[f"{defense}/{intruder}/{gap}"] = {"locked": acquired, "passed": acquired == expected}
    pulls = {}
    for intruder in ("HogRider", "Giant", "Knight"):
        battle = field(units=[("Tombstone", 0, 4, 14, -1), (intruder, 1, 4, 22, -1)])
        battle.step([], 1)
        entities = dict(bodies(battle))
        pulls[intruder] = entities[intruder][F["target_uid"]] == entities["Tombstone"][F["uid"]]
    return {
        "passed": all(r["passed"] for r in rows.values())
        and pulls == {"HogRider": True, "Giant": True, "Knight": False},
        "defensiveWeaponLocks": rows,
        "intruderLocksTombstoneAtEightTiles": pulls,
    }


def building_effects():
    pump = {}
    for name, units in (
        ("control", []),
        ("periodic", [("ElixirCollector", 0, 9, 12, -1)]),
        ("destroyed", [("ElixirCollector", 0, 9, 12, 1)]),
    ):
        battle = field(units=units, initial_elixir=(0, 0))
        battle.step([], 315)
        players = json.loads(battle.state_json())["players"]
        pump[name] = players[0]["elixir_milli"] - players[1]["elixir_milli"]

    target = (STATIONARY_TARGET, 1, 9, 14, 30000)
    bomb = {}
    for name, units in (("control", [target]), ("destroyed", [("BombTower", 0, 9, 13, 1), target])):
        battle = field(units=units)
        hits = []
        hp = 30000
        for tick in range(1, 105):
            battle.step([], 1)
            now = next(r[F["hp"]] for n, r in bodies(battle) if n == STATIONARY_TARGET)
            if now != hp:
                hits.append({"tick": tick, "damage": hp - now})
            hp = now
        bomb[name] = hits
    hut, _ = births([("GoblinPartyHut", 0, 9, 13, 1)], 5)
    brood = dict(Counter(child for _, child in hut))
    silo = field(units=[(STATIONARY_TARGET, 0, 9, 14, -1)])
    stages = []
    for tick in range(241):
        name = next(n for n, _ in bodies(silo) if n.startswith(STATIONARY_TARGET))
        if not stages or stages[-1]["unit"] != name:
            stages.append({"tick": tick, "unit": name})
        silo.step([], 1)
    return {
        "passed": pump == {"control": 0, "periodic": 1000, "destroyed": 1000}
        and not bomb["control"]
        and len(bomb["destroyed"]) == 1
        and bomb["destroyed"][0]["tick"] > 1
        and bomb["destroyed"][0]["damage"] > 0
        and brood == {"SpearGoblin": 3, "Goblin_Stab": 3}
        and stages
        == [
            {"tick": 0, "unit": STATIONARY_TARGET},
            {"tick": 124, "unit": STATIONARY_TARGET + "1"},
            {"tick": 240, "unit": STATIONARY_TARGET + "2"},
        ],
        "collectorElixirMilliAboveOpponent": pump,
        "bombTowerDeathHits": bomb,
        "partyHutDeathChildren": brood,
        "rocketSiloStages": stages,
    }
