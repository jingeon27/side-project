"""One compact public-state contract shared by live play and simulation labels."""

import json
import math

from clash_bot.paths import CONTRACTS_DIR

CONTRACT = json.loads((CONTRACTS_DIR / "decision-v3.json").read_text())
EFFECTS = json.loads((CONTRACTS_DIR / "placement-effects.json").read_text())


def observed_contacts(card, target, enemies):
    if card not in ("ice_wizard", "barbarian_barrel", "poison"):
        return None

    def covered(row):
        kind, x, y, _variant = row
        if card == "barbarian_barrel":
            return (
                kind in EFFECTS["knownGroundBodies"]
                and abs(x - target[0]) <= EFFECTS[card]["width"] / 2
                and target[1] <= y <= target[1] + EFFECTS[card]["length"]
            )
        return math.hypot(x - target[0], y - target[1]) <= EFFECTS[card]["radius"]

    return sum(covered(row) for row in enemies)


def number(value):
    return format(value, ".10g")


def serialize_decision(context):
    code = lambda name: CONTRACT["codes"].get(name, "?")

    def units(rows):
        return " ".join(
            f"{code(kind)}{number(x)},{number(y)}"
            + ("E" if variant == "evolution" else "H" if variant == "hero" else "")
            for kind, x, y, variant in rows
        )

    effects = " ".join(
        f"{'b' if side == 'blue' else 'r'}{code(card)}{number(x)},{number(y)}@{'?' if age is None else number(age)}s"
        for side, card, x, y, age in context.get("effects", [])
    )
    enemy = context["enemyElixir"]
    mana = context["elixir"]
    mana_text = (
        f"{number(math.floor(mana['min'] * 10) / 10)}-{number(math.ceil(mana['max'] * 10) / 10)}?"
        if isinstance(mana, dict)
        else number(mana)
    )
    cycle = (
        " ".join(f"{code(card)}{low}-{high}" for card, low, high in context.get("enemyCycle", []))
        or "?"
    )
    before = (
        f"mana={mana_text};enemyMana={number(math.floor(enemy['min'] * 10) / 10)}-{number(math.ceil(enemy['max'] * 10) / 10)};enemyCycle={cycle};hand={''.join(map(code, context['hand']))};"
        f"next={''.join(map(code, context.get('next') or []))};own={units(context['own'])};enemy={units(context['enemy'])};effects={effects};skill={'?' if context.get('skill') == 'unknown' else int(context.get('skill') == 'ready')}\n"
    )
    contacts = bool(context["enemy"]) and any(
        kind == "card" and observed_contacts(card, [0, 0], []) is not None
        for _, kind, card, *_ in context["actions"]
    )

    def action_text(row):
        letter, kind, card, _cost, x, y = row
        if kind == "ability":
            return f"{letter}:U"
        if kind == "wait":
            return f"{letter}:W"
        hits = observed_contacts(card, [x, y], context["enemy"]) if contacts else None
        return f"{letter}:{code(card)}{number(x)},{number(y)}" + (
            f"h{hits}" if hits is not None else ""
        )

    actions = " ".join(action_text(row) for row in context["actions"])
    hints = (
        [CONTRACT["hints"]["graveyard"]]
        if any(
            side == "red" and card == "graveyard" for side, card, *_ in context.get("effects", [])
        )
        else []
    )
    if contacts:
        hints.insert(0, CONTRACT["hints"]["contacts"])
    if context.get("skill") == "ready":
        hints.append(CONTRACT["hints"]["ability"])
    if "goblin_hut" in context["hand"] or any(row[0] == "goblin_hut" for row in context["own"]):
        hints.append(CONTRACT["hints"]["goblin_hut"])
    return CONTRACT["header"] + (" ".join(hints) + "\n" if hints else "") + before + actions


def mirror_actor_prompt(observation):
    """Teacher becomes BLUE using public BEFORE facts; hidden hand stays unknown."""
    state = observation["situation"]
    if state["at"] > observation["before_at"] + 50:
        raise ValueError("Future opponent context cannot be a prediction input")
    river = observation["river_y"]

    def tile(point):
        # Same one-decimal, JavaScript-style rounding as core/geometry.ts.
        return [
            math.floor((9 + ((point["x"] - 184) * 11) / 178) * 10 + 0.5) / 10,
            math.floor((16 - ((point["y"] - river) * 9.5) / 130) * 10 + 0.5) / 10,
        ]

    def reflected(point):
        return {"x": point["x"], "y": 2 * river - point["y"]}

    def unit(row):
        return [
            row.get("kind") or row.get("card") or "?",
            *tile(reflected(row)),
            row.get("variant", "?"),
        ]

    actions = [
        [
            chr(65 + index),
            "card" if row["card"] else "wait",
            row["card"],
            row["cost"],
            *tile(row["target"]),
        ]
        for index, row in enumerate(observation["candidates"])
    ]
    plays = [play for play in state["own"]["recentPlays"] if play["at"] <= state["at"]][-4:]
    context = {
        "hand": [None] * 4,
        "elixir": state["opponent"]["elixir"],
        # BLUE's actual hand/mana are private to RED; never leak them by swapping.
        "enemyElixir": {"min": 0, "max": 10},
        "enemyCycle": [
            [play["card"], 4 - index, 4 - index] for index, play in enumerate(reversed(plays))
        ],
        "own": [
            unit(row) for row in sorted(state["opponent"]["units"], key=lambda row: -row["y"])[:5]
        ],
        "enemy": [unit(row) for row in sorted(state["own"]["units"], key=lambda row: row["y"])[:8]],
        "effects": [
            [
                "blue" if row["side"] == "red" else "red",
                row["card"],
                *tile(reflected(row)),
                math.floor(row["visibleAgeMs"] / 1000 + 0.5) if row["onsetCertain"] else None,
            ]
            for row in state.get("effects", [])[:4]
        ],
        "skill": "unknown",
        "actions": actions,
    }
    return serialize_decision(context)
