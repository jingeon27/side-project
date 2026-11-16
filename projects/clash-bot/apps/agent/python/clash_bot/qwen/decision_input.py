"""One compact public-state contract shared by live play and simulation labels."""

import json
import math

from clash_bot.paths import CONTRACTS_DIR

CONTRACT = json.loads((CONTRACTS_DIR / "decision-v3.json").read_text())


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
        f"{'b' if side == 'blue' else 'r'}{code(card)}{number(x)},{number(y)}"
        for side, card, x, y, *_ in context.get("effects", [])
    )
    enemy = context["enemyElixir"]
    before = (
        f"mana={number(context['elixir'])};enemyMana={number(math.floor(enemy['min'] * 10) / 10)}-{number(math.ceil(enemy['max'] * 10) / 10)};hand={''.join(map(code, context['hand']))};"
        f"next={''.join(map(code, context.get('next') or []))};own={units(context['own'])};enemy={units(context['enemy'])};effects={effects};skill={int(context.get('skill') == 'ready')}\n"
    )
    actions = " ".join(
        f"{letter}:"
        + (
            "U"
            if kind == "ability"
            else "W"
            if kind == "wait"
            else f"{code(card)}{number(x)},{number(y)}"
        )
        for letter, kind, card, cost, x, y in context["actions"]
    )
    return CONTRACT["header"] + before + actions


def opponent_prompt(observation):
    state = observation.get("situation")
    if not state or not observation.get("candidates"):
        return observation["prompt"]
    if state["at"] > observation.get("before_at", state["at"]) + 50:
        raise ValueError("Future opponent context cannot be a prediction input")
    code = lambda card: CONTRACT["codes"].get(card, "?")

    def units(rows):
        return " ".join(
            f"{code(row.get('kind') or row.get('card'))}{round(row['x'])},{round(row['y'])}"
            for row in rows[:8]
        )

    choices = " ".join(
        chr(65 + i)
        + ":"
        + (
            "W"
            if not row["card"]
            else code(row["card"])
            + ("L" if row["target"]["x"] < 184 else "R" if row["target"]["x"] > 184 else "C")
        )
        for i, row in enumerate(observation["candidates"])
    )
    return (
        "Predict RED next card/lane, not the best BLUE move. RED hand unknown; BLUE bottom. Pixels368x652; river276. L/R/C=lanes. Equal mana,cap10,FIFO4. "
        + " ".join(f"{v}={k}" for k, v in CONTRACT["codes"].items() if len(v) == 1 and v.isupper())
        + f"\nBLUE={units(state['own']['units'])};RED={units(state['opponent']['units'])};REDmana={state['opponent']['elixir']['min']}-{state['opponent']['elixir']['max']}\n"
        + choices
    )
