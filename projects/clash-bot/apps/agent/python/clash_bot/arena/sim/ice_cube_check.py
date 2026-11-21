"""Press the hero skill before its first mark, then compare a surviving cube with one destroyed early."""

import json

from .mechanics import field
from .rules import CARD_ID
from .rules import FIELDS as F
from .status_effects import effects_on


def cube_trial(press, destroy):
    deck = ("Rocket", "Fireball", "Snowball", "Poison", "Knight", "Musketeer", "IceWizard", "Giant")
    battle = field(
        units=[("IceWizardHero", 1, 9.5, 19, 30000), ("Musketeer", 0, 5, 18, 30000)], own_cards=deck
    )
    types = json.loads(battle.unit_types_json())
    mark = freeze = born = ended = thaw = rocket = None
    cube = None
    slow_at_thaw = False
    state = json.loads(battle.state_json())
    for tick in range(1, 145):
        moves = [(1, 4, 0, 0)] if press and tick == 1 else []
        if destroy and cube is not None and rocket is None:
            slot = state["players"][0]["hand"].index(CARD_ID["Rocket"])
            moves.append((0, slot, cube[F["x"]], cube[F["y"]]))
            rocket = tick
        accepted = battle.step(moves, 1)
        if moves and (not accepted or any(a[1] != 0 for a in accepted)):
            raise ValueError(f"Ice cube command rejected: {accepted}")
        state = json.loads(battle.state_json())
        cube = next(
            (r for r in state["entities"] if types[r[F["unit_type"]]] == "IceWizardHero_IceCube"),
            None,
        )
        victim = next(r for r in state["entities"] if types[r[F["unit_type"]]] == "Musketeer")
        effects = effects_on(victim)
        if mark is None and "slow" in effects:
            mark = tick
        if freeze is None and "fullStop" in effects:
            freeze = tick
        if born is None and cube is not None:
            born = tick
        if born is not None and ended is None and cube is None:
            ended = tick
        if freeze is not None and thaw is None and "fullStop" not in effects:
            thaw, slow_at_thaw = tick, "slow" in effects
    return {
        "markTick": mark,
        "freezeTick": freeze,
        "cubeBornTick": born,
        "rocketCastTick": rocket,
        "cubeGoneTick": ended,
        "thawTick": thaw,
        "slowAtThaw": slow_at_thaw,
    }


def ice_cube_control():
    unpressed = cube_trial(False, False)
    natural, destroyed = cube_trial(True, False), cube_trial(True, True)
    return {
        "passed": unpressed["markTick"] is not None
        and unpressed["freezeTick"] is None
        and unpressed["cubeBornTick"] is None
        and all(
            r["markTick"]
            < r["freezeTick"]
            <= r["cubeBornTick"]
            < r["cubeGoneTick"]
            == r["thawTick"]
            and r["slowAtThaw"]
            for r in (natural, destroyed)
        )
        and destroyed["rocketCastTick"] < destroyed["thawTick"] < natural["thawTick"],
        "noSkill": unpressed,
        "cubeLifetime": natural,
        "cubeDestroyed": destroyed,
    }
