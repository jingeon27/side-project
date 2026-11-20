"""Observe releases and actual HP losses separately in isolated, stationary-target native fields."""

import json

from .mechanics import STATIONARY_TARGET, TICK_MS, field
from .rules import FIELDS as F
from .rules import TILE, pinned_table


def observe_attacks(battle, name, tower_slot=None):
    types = json.loads(battle.unit_types_json())
    source = target = None
    appeared = acquired = previous_hp = distance = None
    releases, impacts, damage = [], [], []
    for tick in range(110):  # Ends before the target can change stage.
        entities = json.loads(battle.state_json())["entities"]
        if target is None:
            target = next(
                r[F["uid"]] for r in entities if types[r[F["unit_type"]]] == STATIONARY_TARGET
            )
        victim = next(r for r in entities if r[F["uid"]] == target)
        if source is None:
            found = next(
                (
                    r
                    for r in entities
                    if r[F["team"]] == 0
                    and types[r[F["unit_type"]]] == name
                    and (tower_slot is None or r[F["tower_slot"]] == tower_slot)
                ),
                None,
            )
            if found is not None:
                source, appeared = found[F["uid"]], tick * TICK_MS
        attacker = next((r for r in entities if r[F["uid"]] == source), None)
        if attacker is not None and attacker[F["target_uid"]] == target:
            if acquired is None:
                acquired = tick * TICK_MS
                dx, dy = (attacker[F[axis]] - victim[F[axis]] for axis in ("x", "y"))
                distance = round((dx * dx + dy * dy) ** 0.5 / TILE, 3)
            if attacker[F["attack_phase"]] == 2:
                releases.append(tick * TICK_MS)
        hp = victim[F["hp"]]
        if previous_hp is not None and hp < previous_hp:
            impacts.append(tick * TICK_MS)
            damage.append(previous_hp - hp)
        previous_hp = hp
        if len(releases) >= 2 and len(impacts) >= 2:
            return {
                "appearedMs": appeared,
                "firstTargetLockMs": acquired,
                "distanceAtLockTiles": distance,
                "firstReleaseMs": releases[0],
                "firstImpactMs": impacts[0],
                "releaseIntervalMs": releases[1] - releases[0],
                "impactIntervalMs": impacts[1] - impacts[0],
                "damagePerHit": damage[:2],
            }
        battle.step([], 1)
    raise ValueError(f"{name}: only {len(releases)} releases and {len(impacts)} impacts observed")


def unit_attack_timing():
    units = pinned_table()["units"]
    samples = {}
    for name, gap in (
        ("Knight", 1.4),
        ("Skeleton", 1.3),
        ("SpearGoblin", 3),
        ("SpearGoblin_Dummy", 4.5),
        ("IceWizard", 3),
        ("Cannon", 4),
        ("Musketeer", 4),
        ("Tesla", 4),
        ("Xbow", 6),
        ("BombTower", 4),
        ("Furnace_rework", 4),
    ):
        battle = field(units=[(name, 0, 9 - gap, 14, -1), (STATIONARY_TARGET, 1, 9, 14, 30000)])
        sample = observe_attacks(battle, name)
        # These ordinary fresh attacks have no charge, rush, first-shot override or debuff.
        row = units[name]
        sample["passed"] = (
            sample["firstReleaseMs"] == row["hit_speed_ms"] - (row["load_time_ms"] or 0)
            and sample["releaseIntervalMs"] == sample["impactIntervalMs"] == row["hit_speed_ms"]
            and sample["firstReleaseMs"] <= sample["firstImpactMs"]
            and sample["damagePerHit"][0] == sample["damagePerHit"][1] > 0
        )
        samples[name] = sample
    target = (STATIONARY_TARGET, 1, 9, 14, 30000)
    control = field(units=[target])
    control.step([], 109)
    control_hp = next(
        r[F["hp"]]
        for r in json.loads(control.state_json())["entities"]
        if r[F["team"]] == 1 and r[F["tower_slot"]] == -1
    )
    deploy_ticks = units["Knight"]["deploy_time_ms"] // TICK_MS
    delayed = observe_attacks(
        field(units=[("Knight", 0, 7.6, 14, -1), target], unit_deploy_ticks=[deploy_ticks, 0]),
        "Knight",
    )
    hut = observe_attacks(
        field(units=[("GoblinHut_Rework", 0, 5, 14, -1), target]), "SpearGoblin_Dummy"
    )
    return {
        "passed": control_hp == 30000
        and all(s["passed"] for s in samples.values())
        and delayed["firstReleaseMs"] - samples["Knight"]["firstReleaseMs"]
        == deploy_ticks * TICK_MS
        and delayed["releaseIntervalMs"] == samples["Knight"]["releaseIntervalMs"]
        and hut["appearedMs"] < hut["firstReleaseMs"] < hut["firstImpactMs"]
        and hut["damagePerHit"] == samples["SpearGoblin_Dummy"]["damagePerHit"]
        and hut["releaseIntervalMs"]
        == hut["impactIntervalMs"]
        == samples["SpearGoblin_Dummy"]["releaseIntervalMs"],
        "alreadyDeployed": samples,
        "knightWithDeployDelay": delayed,
        "firstChildOfActiveHut": hut,
    }
