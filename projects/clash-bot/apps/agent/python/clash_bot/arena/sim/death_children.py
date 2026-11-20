"""Track actual child identities, team, deployment clocks and the Battle Ram's building impact."""

import json
from collections import Counter

from .mechanics import STATIONARY_TARGET, field
from .rules import FIELDS as F
from .rules import canonical


def trace(parent, expected_child, team, impact):
    def unit(name, side, x, y, hp):
        return (name, side, *canonical(x, y, team), hp)

    units = (
        [unit(parent, team, 3.5, 14.5, -1), unit(STATIONARY_TARGET, 1 - team, 9, 14.5, 30000)]
        if impact
        else [
            unit(parent, team, 6, 14, 100 if parent == "GoblinHut_Rework" else 1),
            unit("Musketeer", 1 - team, 10, 14, 30000),
        ]
    )
    battle = field(units=units)
    types = json.loads(battle.unit_types_json())
    initial = json.loads(battle.state_json())["entities"]
    parent_uid = next(
        r[F["uid"]] for r in initial if r[F["team"]] == team and r[F["tower_slot"]] == -1
    )
    target_uid = next(
        r[F["uid"]] for r in initial if r[F["team"]] != team and r[F["tower_slot"]] == -1
    )
    seen = {r[F["uid"]] for r in initial}
    events, lost_hp, clocks = [], [], []
    died = None
    hp = 30000
    for tick in range(1, 121):
        battle.step([], 1)
        entities = json.loads(battle.state_json())["entities"]
        if died is None and not any(r[F["uid"]] == parent_uid for r in entities):
            died = tick
        for r in entities:
            if r[F["uid"]] == target_uid and r[F["hp"]] < hp:
                lost_hp.append({"tick": tick, "damage": hp - r[F["hp"]]})
                hp = r[F["hp"]]
            if r[F["uid"]] not in seen:
                name = types[r[F["unit_type"]]]
                events.append((tick, name, r[F["team"]], r[F["level"]]))
                if name == expected_child:
                    clocks.append(r[F["deploy_ticks"]])
                seen.add(r[F["uid"]])
    return {"deathTick": died, "births": events, "childDeployTicks": clocks, "targetHits": lost_hp}


def death_children():
    results = {}
    for parent, child, count in (
        ("GoblinHut_Rework", "SpearGoblin", 1),
        ("BattleRam", "Barbarian", 2),
        ("BattleRam_EV1", "Barbarian_EV1", 2),
        ("Golem", "Golemite", 2),
        ("LavaHound", "LavaPups", 6),
        ("ElixirGolem", "ElixirGolem2", 2),
        ("ElixirGolem2", "ElixirGolem4", 2),
        ("DarkWitch", "Bat", 1),
    ):
        cases = {}
        for team, side in enumerate(("blue", "red")):
            killed = trace(parent, child, team, False)
            died, births = killed["deathTick"], killed["births"]
            on_death = Counter((n, t, level) for tick, n, t, level in births if tick == died)
            children = [tick for tick, n, t, _ in births if n == child and t == team]
            killed["passed"] = (
                died is not None
                and on_death == {(child, team, 11): count}
                and all(t == died for t in children if t <= died)
            )
            # Periodic spawns after the target dies are a separate mechanic.
            if parent in ("BattleRam", "BattleRam_EV1", "GoblinHut_Rework"):
                killed["passed"] &= len(children) == count
            cases[side] = {"destroyed": killed}
            if parent.startswith("BattleRam"):
                killed["passed"] &= killed["childDeployTicks"] == [20, 20]
                contact = trace(parent, child, team, True)
                hits, spawned = contact["targetHits"], contact["births"]
                if parent == "BattleRam":
                    contact["passed"] = (
                        bool(hits)
                        and hits[0]["tick"] == contact["deathTick"]
                        and spawned == [(contact["deathTick"], child, team, 11)] * 2
                        and contact["childDeployTicks"] == [20, 20]
                    )
                else:
                    contact["passed"] = (
                        len(hits) >= 2
                        and hits[0]["damage"] == hits[1]["damage"] > 0
                        and contact["deathTick"] is None
                        and not spawned
                    )
                cases[side]["buildingContact"] = contact
        results[parent] = cases
    return {
        "passed": all(
            v["passed"]
            for sides in results.values()
            for cases in sides.values()
            for v in cases.values()
        ),
        "byParent": results,
    }
