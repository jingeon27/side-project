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
    if code not in ("P", "G", "H") or point is None:
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
            return (observed is None or int(observed[1]) == 0) and (
                enemy_max is None or enemy_max >= cost
            )

        counters = any(
            possible(counter, cost) for counter, cost in POLICY["graveyardCounters"].items()
        )
        followup = "P" in state.get("hand", "") and mana is not None and mana >= 9
        if not tank and counters and not followup:
            total += POLICY["unsupportedGraveyard"]
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
            and state.get("enemy") == ""
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
