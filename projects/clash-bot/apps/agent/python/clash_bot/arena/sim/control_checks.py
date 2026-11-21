"""Compare actual motion, weapon releases and projectile impacts with and without control effects."""

import json
import math
from dataclasses import dataclass

from .mechanics import STATIONARY_TARGET, field
from .rules import CARD_ID, TILE
from .rules import FIELDS as F
from .status_effects import effects_on

DECK = ("Freeze", "Snowball", "Fireball", "Poison", "Knight", "Musketeer", "IceWizard", "Giant")


@dataclass
class Frame:
    tick: int
    x: float
    y: float
    effects: set
    release: bool
    target_hp: int


def trace(name="Musketeer", casts=(), ice_wizard=False):
    units = [(STATIONARY_TARGET, 0, 9, 14, 30000), (name, 1, 13, 14, 30000)]
    if ice_wizard:
        units.append(("IceWizard", 0, 8.5, 13, -1))
    battle = field(units=units, own_cards=DECK)
    initial = json.loads(battle.state_json())
    types = json.loads(battle.unit_types_json())
    target = next(
        r[F["uid"]] for r in initial["entities"] if types[r[F["unit_type"]]] == STATIONARY_TARGET
    )
    uid = next(
        r[F["uid"]] for r in initial["entities"] if r[F["team"]] == 1 and r[F["tower_slot"]] == -1
    )
    state = initial
    frames = []
    for tick in range(1, 123):
        hand = state["players"][0]["hand"]
        moves = [
            (0, hand.index(CARD_ID[card]), round(x * TILE), 14 * TILE)
            for at, card, x in casts
            if tick == at
        ]
        accepted = battle.step(moves, 1)
        if moves and (not accepted or any(a[1] != 0 for a in accepted)):
            raise ValueError(f"Control spell rejected: {accepted}")
        state = json.loads(battle.state_json())
        entities = {r[F["uid"]]: r for r in state["entities"]}
        r = entities[uid]
        frames.append(
            Frame(
                tick,
                r[F["x"]] / TILE,
                r[F["y"]] / TILE,
                effects_on(r),
                r[F["target_uid"]] == target and r[F["attack_phase"]] == 2,
                entities[target][F["hp"]],
            )
        )
    return frames


def receipt(frames):
    spans = {}
    for effect in ("fullStop", "slow", "knockback"):
        ticks = [f.tick for f in frames if effect in f.effects]
        if ticks:
            spans[effect] = [ticks[0], ticks[-1]]
    return {
        "releaseTicks": [f.tick for f in frames if f.release],
        "effectWindowsTicks": spans,
        "firstTargetDamageTick": next((f.tick for f in frames if f.target_hp < 30000), None),
    }


def travel(frames, first, last):
    return sum(
        math.hypot(b.x - a.x, b.y - a.y)
        for a, b in zip(frames[first - 1 : last - 1], frames[first:last])
    )


def ram_charge(parent, spell):
    battle = field(
        units=[(STATIONARY_TARGET, 0, 9, 14.5, 30000), (parent, 1, 14.5, 14.5, -1)], own_cards=DECK
    )
    state = json.loads(battle.state_json())
    target = next(
        r[F["uid"]] for r in state["entities"] if r[F["team"]] == 0 and r[F["tower_slot"]] == -1
    )
    ram = next(r for r in state["entities"] if r[F["team"]] == 1 and r[F["tower_slot"]] == -1)
    charged = reset = hit = damage = None
    # Projectile travel differs. These casts meet the Ram just before a charged impact.
    cast_at = {"Freeze": 53, "Fireball": 30, "Snowball": 36}.get(spell)
    for tick in range(1, 124):
        moves = []
        if tick == cast_at:
            slot = state["players"][0]["hand"].index(CARD_ID[spell])
            moves.append((0, slot, ram[F["x"]] - TILE // 2, ram[F["y"]]))
        accepted = battle.step(moves, 1)
        if moves and (not accepted or accepted[0][1] != 0):
            raise ValueError(f"{parent}: {spell} rejected")
        state = json.loads(battle.state_json())
        rows = {r[F["uid"]]: r for r in state["entities"]}
        if rows[target][F["hp"]] < 30000:
            hit, damage = tick, 30000 - rows[target][F["hp"]]
            break
        ram = rows[ram[F["uid"]]]
        if charged is None and ram[F["charge"]] >= 1000:
            charged = tick
        if charged is not None and reset is None and ram[F["charge"]] == 0:
            reset = tick
    return {
        "chargedTick": charged,
        "resetTick": reset,
        "firstImpactTick": hit,
        "damage": damage,
        "observedThroughTick": tick,
    }


def ram_interruptions():
    results = {}
    for parent in ("BattleRam", "BattleRam_EV1"):
        cases = {
            spell or "baseline": ram_charge(parent, spell)
            for spell in (None, "Fireball", "Snowball", "Freeze")
        }
        base = cases["baseline"]
        actual = [cases[name] for name in ("Fireball", "Snowball")]
        freeze = cases["Freeze"]
        passed = (
            base["chargedTick"] is not None
            and base["resetTick"] is None
            and base["damage"] > 0
            and all(
                r["chargedTick"] < r["resetTick"] < r["firstImpactTick"]
                and 0 < r["damage"] < base["damage"]
                for r in actual
            )
            and freeze["chargedTick"] < freeze["resetTick"]
            and freeze["firstImpactTick"] is None
        )
        results[parent] = {"passed": passed, "bySpell": cases}
    return {"passed": all(r["passed"] for r in results.values()), "byParent": results}


def crowd_control():
    cases = {
        "baseline": trace(),
        "iceWizard": trace(ice_wizard=True),
        "fireball": trace(casts=[(1, "Fireball", 12)]),
        "snowball": trace(casts=[(1, "Snowball", 12)]),
        "freeze": trace(casts=[(1, "Freeze", 13)]),
        "freezeThenSnowball": trace(casts=[(1, "Freeze", 13), (5, "Snowball", 12)]),
        "snowballThenFreeze": trace(casts=[(1, "Snowball", 12), (45, "Freeze", 14)]),
        "frozenAfterRelease": trace(casts=[(15, "Freeze", 13)]),
    }
    reports = {name: receipt(frames) for name, frames in cases.items()}
    ordinary, ice, fire, snow = (
        reports[k]["releaseTicks"] for k in ("baseline", "iceWizard", "fireball", "snowball")
    )
    combo = cases["freezeThenSnowball"]
    triple = [f for f in combo if f.effects == {"fullStop", "slow", "knockback"}]
    frozen = cases["freeze"]
    still = trace("Knight", [(1, "Freeze", 12)])
    walking, slowed = trace("Knight"), trace("Knight", ice_wizard=True)
    heavy = trace("Giant", [(1, "Fireball", 12)])
    heavy_control = trace("Giant")
    flight = reports["frozenAfterRelease"]
    ordered = reports["snowballThenFreeze"]
    motion = {
        "knightWalkTiles": travel(walking, 16, 29),
        "slowedKnightWalkTiles": travel(slowed, 16, 29),
        "frozenKnightWalkTiles": travel(still, 2, 65),
        "frozenTargetKnockedTiles": travel(combo, triple[0].tick, triple[-1].tick) if triple else 0,
        "giantFireballPathDeltaTiles": max(
            math.hypot(a.x - b.x, a.y - b.y) for a, b in zip(heavy, heavy_control)
        ),
    }
    no_attacks = all(
        not f.release
        for frames in cases.values()
        for f in frames
        if f.effects & {"fullStop", "knockback"}
    )
    passed = (
        no_attacks
        and ice[1] - ice[0] > ordinary[1] - ordinary[0]
        and fire[1] > ordinary[1]
        and snow[1] > ordinary[1]
        and bool(triple)
        and motion["frozenTargetKnockedTiles"] > 0.5
        and motion["knightWalkTiles"]
        > motion["slowedKnightWalkTiles"]
        > 0
        == motion["frozenKnightWalkTiles"]
        and motion["giantFireballPathDeltaTiles"] == 0
        and all("knockback" not in f.effects for f in heavy)
        and all(
            f.x == frozen[0].x and f.y == frozen[0].y for f in frozen if "fullStop" in f.effects
        )
        and reports["freezeThenSnowball"]["releaseTicks"][0] > reports["freeze"]["releaseTicks"][0]
        and ordered["effectWindowsTicks"]["slow"][1]
        < ordered["effectWindowsTicks"]["fullStop"][1]
        < ordered["releaseTicks"][-1]
        and flight["releaseTicks"][0]
        < flight["effectWindowsTicks"]["fullStop"][0]
        <= flight["firstTargetDamageTick"]
        <= flight["effectWindowsTicks"]["fullStop"][1]
    )
    return {
        "passed": passed,
        "rangedAttack": reports,
        "motion": {k: round(v, 4) for k, v in motion.items()},
    }
