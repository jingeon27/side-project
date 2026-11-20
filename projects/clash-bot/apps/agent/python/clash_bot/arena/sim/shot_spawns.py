"""Test the advertised child of a building projectile even when the card is outside the league."""

import json

from .mechanics import STATIONARY_TARGET, TICK_MS
from .rules import CARDS, SPEC, TILE, canonical, new_battle, pinned_table
from .rules import FIELDS as F


def shot_trial(name, source, child, team, deploy):
    fillers = ["Barbarians", "Knight", "Archer", "Zap", "Minions", "Fireball", "Skeletons"]
    names = list(dict.fromkeys([name, STATIONARY_TARGET, *fillers]))[:8]
    battle = new_battle(names)
    battle.set_command_delay_ticks(0, 0)
    target_x, target_y = canonical(9, 14.5, team)
    x, y = canonical(2.5, 13.5, team)
    battle.reset(
        seed=8,
        decks=[list(range(8))] * 2,
        shuffle=0,
        start_tick=100,
        elixir_milli=[10000, 10000],
        tower_hp=None,
        spawns=[],
        unit_spawns=[
            (
                STATIONARY_TARGET,
                1 - team,
                round(target_x * TILE),
                round(target_y * TILE),
                30000,
                SPEC["level"],
                0,
            )
        ],
    )
    types = json.loads(battle.unit_types_json())
    target = next(
        r[F["uid"]]
        for r in json.loads(battle.state_json())["entities"]
        if types[r[F["unit_type"]]] == STATIONARY_TARGET
    )
    releases, children = [], set()
    first_damage = None
    for tick in range(1, 124):  # A fresh silo first changes stage at tick 124.
        moves = [(team, 0, round(x * TILE), round(y * TILE))] if deploy and tick == 1 else []
        accepted = battle.step(moves, 1)
        if moves and (not accepted or accepted[0][1] != 0):
            raise ValueError(f"Projectile-spawn test deployment rejected for {name}: {accepted}")
        entities = json.loads(battle.state_json())["entities"]
        victim = next(r for r in entities if r[F["uid"]] == target)
        if first_damage is None and victim[F["hp"]] < 30000:
            first_damage = tick
        for row in entities:
            if row[F["team"]] != team:
                continue
            unit = types[row[F["unit_type"]]]
            if unit == child:
                children.add(row[F["uid"]])
            if unit == source and row[F["attack_phase"]] == 2 and row[F["target_uid"]] == target:
                releases.append(tick)
    return {
        "releaseTicks": releases,
        "firstImpactTick": first_damage,
        "observedThroughTick": 123,
        "childrenObserved": len(children),
    }


def paired_shots(card, team):
    shot = card["projectile"]
    name, source, child = card["name"], card["summon_character"], shot["spawn_character"]
    control = shot_trial(name, source, child, team, False)
    sample = shot_trial(name, source, child, team, True)
    impact = sample["firstImpactTick"]
    if (
        control["firstImpactTick"] is not None
        or control["childrenObserved"]
        or not sample["releaseTicks"]
        or impact is None
        or impact < sample["releaseTicks"][0]
        or (sample["observedThroughTick"] - impact) * TICK_MS
        < (shot.get("spawn_character_deploy_time_ms") or 0)
    ):
        raise ValueError(f"Could not isolate {name}'s projectile impact for team {team}")
    return sample


def building_shot_spawns():
    results = {}
    for card in pinned_table()["cards"]:
        shot = card.get("projectile")
        if (
            card["kind"] != "building"
            or not isinstance(shot, dict)
            or not shot.get("spawn_character")
        ):
            continue
        sides = [paired_shots(card, team) for team in (0, 1)]
        results[card["name"]] = {
            "expectedChild": shot["spawn_character"],
            "blue": sides[0],
            "red": sides[1],
            "reproduced": all(
                side["childrenObserved"] >= (shot.get("spawn_character_count") or 1)
                for side in sides
            ),
        }
    return results


def shot_spawn_eligibility():
    results = building_shot_spawns()
    return {
        "passed": all((name in CARDS) == r["reproduced"] for name, r in results.items()),
        "byEngine": results,
    }
