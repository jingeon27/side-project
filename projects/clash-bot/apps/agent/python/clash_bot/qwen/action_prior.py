"""Explicit mechanics priors for the same categorical policy used by PPO.

All legal choices remain available. Position count must not buy a card more
probability; observed-zero opportunities and a known reserved counter pay a
cost. These are declared priors, not claims that the model learned the rules.
"""

import json
import math
import re
from collections import Counter

from clash_bot.paths import CONTRACTS_DIR

COMBAT = json.loads((CONTRACTS_DIR / "combat-projection.json").read_text())
POLICY = COMBAT["policy"]
DEPLOYMENT = json.loads((CONTRACTS_DIR / "deployment.json").read_text())
EFFECTS = json.loads((CONTRACTS_DIR / "placement-effects.json").read_text())
KING = [18 - DEPLOYMENT["kingTowerTile"][0], 32 - DEPLOYMENT["kingTowerTile"][1]]


def action_prior(prompt, count):
    actions = re.findall(r"(?:^| )([A-Z]):([A-Z])([^ ]*)", prompt.splitlines()[-1])
    if len(actions) != count or [row[0] for row in actions] != [chr(65 + i) for i in range(count)]:
        raise ValueError("Current categorical policy needs the complete ordered action line")
    groups = Counter(code for _, code, _ in actions)
    state = (
        dict(re.findall(r"(\w+)=([^;\n]*)", prompt.splitlines()[-2]))
        if len(prompt.splitlines()) > 1
        else {}
    )
    result = []
    for _, code, facts in actions:
        bias = -math.log(groups[code])
        if code == "U" and re.search(r"q0(?:\D|$)", facts):
            bias += POLICY["noObservedSkillOpportunity"]
        if code == "B" and re.search(r"q0(?:\D|$)", facts):
            bias += POLICY["reservedRoll"] if "r1" in facts else POLICY["emptyRoll"]
        bias += contextual_prior(code, facts, state)
        result.append(bias)
    return result


def coordinate(text):
    found = re.match(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", text)
    return [float(value) for value in found.groups()] if found else None


def bodies(text):
    return [
        (row[0], float(row[1]), float(row[2]))
        for row in re.findall(r"([A-Za-z?])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", text)
    ]


def contextual_prior(code, facts, state):
    point = coordinate(facts)
    if code not in ("P", "G", "H", "F", "K", "I", "S", "B") or point is None:
        return 0
    mana_text = state.get("mana")
    mana = float(mana_text.split("-")[0]) if mana_text is not None else None
    enemy_text = state.get("enemyMana")
    enemy_max = float(enemy_text.split("-")[-1]) if enemy_text is not None else None
    own = bodies(state["own"]) if "own" in state else []
    effects = state.get("effects")
    active = [
        (side, card, float(x), float(y), None if age == "?" else float(age))
        for side, card, x, y, age in re.findall(
            r"([br])([A-Z])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)@([?\d.]+)s", effects or ""
        )
    ]
    towers = state.get("towers")
    enemy_towers = (
        [float(value) for value in towers.split("|")[-1].split(",")]
        if towers and towers != "?"
        else None
    )
    king_active = enemy_towers is not None and (enemy_towers[0] < 1 or 0 in enemy_towers[1:])
    total = 0
    enemy = bodies(state.get("enemy", ""))
    drill = coordinate(state.get("drill", "?")) or next(
        ([x, y] for card, x, y in enemy if card == "d" and y < 16), None
    )
    emergence = coordinate(state.get("emergence", "?"))
    graves = [
        (x, y)
        for side, card, x, y, age in active
        if side == "r" and card == "G" and y < 16 and (age is None or age < 9)
    ]
    own_poison = [
        (x, y)
        for side, card, x, y, age in active
        if side == "b" and card == "P" and (age is None or age < 6)
    ]
    uncovered = [
        (x, y)
        for x, y in graves
        if not any(math.hypot(x - px, y - py) < 3 for px, py in own_poison)
    ]
    distance = lambda target: math.hypot(point[0] - target[0], point[1] - target[1])
    defending_grave = any(
        distance(target) <= (5 if code == "I" else 3) for target in uncovered
    ) and code in ("I", "K", "S", "P", "B")
    defending_drill = (
        drill is not None and distance(drill) <= 3.5 and code in ("K", "S", "I", "B", "P")
    )
    if uncovered and not defending_grave:
        total += POLICY["unansweredGraveyard"]
    if drill is not None:
        if not defending_drill:
            total += POLICY["unansweredDrill"]
        elif code == "K" and not any(
            card == "K" and math.hypot(x - drill[0], y - drill[1]) < 2.5 for card, x, y in own
        ):
            total += POLICY["drillKnightDefense"]
        elif code == "S" and not state.get("drill", "").endswith("@emerged"):
            total += POLICY["preEmergenceSkeletons"]
        elif code == "B" and not any(
            card == "j" and math.hypot(x - drill[0], y - drill[1]) < 3 for card, x, y in enemy
        ):
            total += POLICY[
                "emptyRoll"
            ]  # rolling a healthy/unknown-HP Drill is not guaranteed cleanup
    if emergence is not None and distance(emergence) < 4:
        if code == "S":
            total += POLICY["preEmergenceSkeletons"]
        if code == "K" and not any(
            card == "K" and math.hypot(x - emergence[0], y - emergence[1]) < 2.5
            for card, x, y in own
        ):
            total += POLICY["drillKnightDefense"]
    useful_defense = (
        defending_grave
        or defending_drill
        or (emergence is not None and distance(emergence) < 4 and code in ("K", "I"))
        or any(y < 18 and math.hypot(x - point[0], y - point[1]) < 5 for _, x, y in enemy)
    )
    if (
        mana is not None
        and enemy_max is not None
        and not useful_defense
        and code in ("F", "H", "G", "I", "K", "S", "P")
    ):
        enemy_min = float(enemy_text.split("-")[0])
        own_max = float(mana_text.split("-")[-1].rstrip("?"))
        if own_max < enemy_min:
            total += POLICY["confirmedElixirDeficit"]
        elif mana - enemy_max <= -2:
            tank = any(card in ("K", "F") and y >= 17 for card, _, y in own)
            reserve = mana - {"F": 4, "H": 4, "G": 5, "I": 3, "K": 3, "S": 1, "P": 4}[code]
            if reserve < 3 or (code == "G" and not tank):
                total += POLICY["possibleElixirDeficit"]
    if code in POLICY["buildupMana"]:
        enemy = bodies(state.get("enemy", ""))
        urgent = (
            drill is not None
            or emergence is not None
            or any(y < 18 for _, _, y in enemy)
            or any(side == "r" and card == "G" for side, card, *_ in active)
        )
        if not urgent and mana is not None:
            if mana < POLICY["buildupMana"][code]:
                total += POLICY["lowReserveBuildup"]
            else:
                evolution = re.search(code + r"(\d+)-(\d+)", state.get("ownEvolution", ""))
                if code in ("F", "K") and evolution and evolution[1] == evolution[2]:
                    total += POLICY["evolutionCyclePreference"]
    if code in ("P", "G"):
        radius = EFFECTS["poison"]["radius"] if code == "P" else POLICY["graveyardSpawnRadius"]
        if (
            not king_active
            and math.hypot(point[0] - KING[0], point[1] - KING[1])
            <= radius + POLICY["kingFootprintRadius"]
        ):
            total += POLICY["kingDamage"]
    if code == "P":
        defending = any(
            side == "r"
            and card == "G"
            and math.hypot(point[0] - x, point[1] - y) <= 3
            and (age is None or age < 8)
            for side, card, x, y, age in active
        )
        potential = re.search(r"n(\d+)", facts)
        combo = (
            mana is not None
            and mana - 4 >= 3
            and any(
                side == "b"
                and card == "G"
                and math.hypot(point[0] - x, point[1] - y) < 4
                and (age is None or age < 9)
                for side, card, x, y, age in active
            )
        )
        if combo and potential is not None and int(potential[1]) > 0:
            total += POLICY["graveyardPoisonFollowup"]
        if potential is not None and not defending:
            if int(potential[1]) == 0:
                total += POLICY["emptyPoison"]
            elif int(potential[1]) < 276:
                total += POLICY["thinPoison"]
        if any(
            side == "b"
            and card == "P"
            and math.hypot(point[0] - x, point[1] - y) < 3
            and (age is None or age < 6)
            for side, card, x, y, age in active
        ):
            total += POLICY["redundantPoison"]
    if code == "G":
        tank = any(card in ("K", "F") and y >= 17 and abs(point[0] - x) < 4.5 for card, x, y in own)
        cycle = state.get("enemyCycle")

        def possible(counter, cost):
            observed = re.search(counter + r"(\d+)-(\d+)", cycle or "")
            if enemy_max is not None and enemy_max < cost:
                return 0
            if observed is None:
                return POLICY["unknownCounterWeight"]
            if int(observed[1]) > 0:
                return 0
            return 1 if int(observed[2]) == 0 else POLICY["uncertainCounterWeight"]

        counters = max(
            possible(counter, cost) for counter, cost in POLICY["graveyardCounters"].items()
        )
        followup = "P" in state.get("hand", "") and mana is not None and mana >= 9
        if not tank and counters and not followup:
            advantage = mana is not None and enemy_max is not None and mana - enemy_max >= 2
            total += POLICY["unsupportedGraveyard"] * counters * (0.5 if advantage else 1)
        if (
            mana is not None
            and mana < 9
            and any(
                side == "r" and card == "G" and (age is None or age < 8)
                for side, card, _, _, age in active
            )
        ):
            total += POLICY["defenseReserve"]
    if code == "H":
        if (
            mana is not None
            and mana < 8
            and not any(y < 18 for _, _, y in bodies(state.get("enemy", "")))
            and not any(side == "r" and card == "G" for side, card, _, _, _ in active)
        ):
            total += POLICY["earlyHut"]
        if any(card == "H" and math.hypot(point[0] - x, point[1] - y) < 6 for card, x, y in own):
            total += POLICY["redundantHut"]
    return total


def main():
    """CPU-only mechanics scores for a read-only external policy observer."""
    import sys

    from pydantic import BaseModel, ConfigDict, Field

    class Input(BaseModel):
        model_config = ConfigDict(strict=True, extra="forbid")
        prompt: str
        count: int = Field(ge=1, le=26)

    if sys.argv[1:] != ["serve"]:
        raise ValueError("Use action_prior serve")
    print(json.dumps({"type": "ready"}), flush=True)
    for line in sys.stdin:
        try:
            request = Input.model_validate_json(line)
            print(
                json.dumps({"type": "result", "bias": action_prior(request.prompt, request.count)}),
                flush=True,
            )
        except (ValueError, KeyError) as error:
            print(json.dumps({"type": "error", "message": str(error)}), flush=True)


if __name__ == "__main__":
    main()
