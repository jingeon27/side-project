"""Feature vectors of the public decision context; the TypeScript runtime computes the same numbers.

The context is the decision-v3 description that both the live screen and the simulator produce.
Tower hit points are optional: the live screen does not read them yet, so training hides them for
part of the samples and the network also learns to act without them.
"""

import hashlib
import math
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat, PositiveInt

from clash_bot.paths import CONTRACTS_DIR


class Grid(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    columns: PositiveInt
    rows: PositiveInt
    width: PositiveFloat
    height: PositiveFloat


class FastPolicySpec(BaseModel):
    """contracts/fast-policy.json; src/core/policy/fast-policy.ts reads the same file."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-fast-policy-v2"]
    cards: tuple[str, ...] = Field(min_length=8, max_length=8)
    spells: tuple[str, ...]
    bodies: tuple[str, ...] = Field(min_length=1)
    effects: tuple[str, ...]
    grid: Grid
    clockSeconds: PositiveFloat
    hidden: PositiveInt
    attention: PositiveInt


SPEC = FastPolicySpec.model_validate_json((CONTRACTS_DIR / "fast-policy.json").read_text())
CELLS = SPEC.grid.columns * SPEC.grid.rows
TOWERS_KNOWN = 5
HAND = 12
NEXT = HAND + 4 * len(SPEC.cards)
UNITS = NEXT + len(SPEC.cards)
FIELD_EFFECTS = UNITS + 2 * len(SPEC.bodies) * CELLS
STATE_SIZE = FIELD_EFFECTS + 2 * len(SPEC.effects) * CELLS
ACTION_SIZE = len(SPEC.cards) + 8


def cell(x, y):
    # Truncate toward zero like the TypeScript runtime, then keep the cell on the grid.
    column = min(SPEC.grid.columns - 1, max(0, int(x / (SPEC.grid.width / SPEC.grid.columns))))
    row = min(SPEC.grid.rows - 1, max(0, int(y / (SPEC.grid.height / SPEC.grid.rows))))
    return row * SPEC.grid.columns + column


def context_features(context):
    vector = np.zeros(STATE_SIZE, np.float32)
    enemy = context["enemyElixir"]
    vector[:5] = [
        min(1.0, context.get("clock", 0) / SPEC.clockSeconds),
        math.floor(context["elixir"]) / 10,
        enemy["min"] / 10,
        enemy["max"] / 10,
        float(context.get("skill") == "ready"),
    ]
    if towers := context.get("towers"):
        vector[TOWERS_KNOWN] = 1
        vector[6:9] = towers["own"]
        vector[9:12] = towers["enemy"]
    for slot, card in enumerate(context["hand"][:4]):
        if card in SPEC.cards:
            vector[HAND + slot * len(SPEC.cards) + SPEC.cards.index(card)] = 1
    upcoming = [card for card in context.get("next") or [] if card in SPEC.cards]
    for card in upcoming:
        vector[NEXT + SPEC.cards.index(card)] += 1 / len(upcoming)
    for side, rows in enumerate((context["own"], context["enemy"])):
        for kind, x, y, _variant in rows:
            body = kind if kind in SPEC.bodies else "?"
            index = UNITS + (side * len(SPEC.bodies) + SPEC.bodies.index(body)) * CELLS + cell(x, y)
            vector[index] = min(1.0, vector[index] + 0.5)
    for side, card, x, y, *_age in context.get("effects") or []:
        if card in SPEC.effects:
            channel = (0 if side == "blue" else 1) * len(SPEC.effects) + SPEC.effects.index(card)
            vector[FIELD_EFFECTS + channel * CELLS + cell(x, y)] = 1
    return vector


def hide_towers(vector):
    hidden = vector.copy()
    hidden[TOWERS_KNOWN:HAND] = 0
    return hidden


def action_vector(row):
    """[8 cards, wait, ability, cost, x, y, x², y², spell]; waiting and the ability have no position."""
    _letter, kind, card, cost, x, y = row
    match kind:
        case "card":
            onehot = [float(card == name) for name in SPEC.cards]
            place = [x / 18, y / 32, (x / 18) ** 2, (y / 32) ** 2, float(card in SPEC.spells)]
        case "wait" | "ability":
            onehot, place = [0.0] * len(SPEC.cards), [0.0] * 5
        case _:
            raise ValueError(f"Unknown decision action kind: {kind}")
    return [*onehot, float(kind == "wait"), float(kind == "ability"), cost / 10, *place]


def action_features(context):
    return np.array([action_vector(row) for row in context["actions"]], np.float32).reshape(
        -1, ACTION_SIZE
    )


WEIGHT_SHAPES = {
    "encoder.weight": (SPEC.hidden, STATE_SIZE),
    "encoder.bias": (SPEC.hidden,),
    "query.weight": (SPEC.attention, SPEC.hidden),
    "query.bias": (SPEC.attention,),
    "action.weight": (SPEC.attention, ACTION_SIZE),
    "action.bias": (SPEC.attention,),
    "value.weight": (1, SPEC.hidden),
    "value.bias": (1,),
}


def forward(weights, state, actions):
    """Action probabilities and value; the same arithmetic as src/core/policy/fast-policy.ts."""
    hidden = np.maximum(0, state @ weights["encoder.weight"].T + weights["encoder.bias"])
    query = hidden @ weights["query.weight"].T + weights["query.bias"]
    keys = np.maximum(0, actions @ weights["action.weight"].T + weights["action.bias"])
    logits = keys @ query / np.sqrt(SPEC.attention)
    probabilities = np.exp(logits - np.max(logits))
    probabilities /= probabilities.sum()
    value = float(np.tanh(hidden @ weights["value.weight"].T + weights["value.bias"]).item())
    return logits, probabilities, value


def checksum(weights):
    digest = hashlib.sha256()
    for key, value in sorted(weights.items()):
        digest.update(key.encode())
        digest.update(np.asarray(value, np.float32).tobytes())
    return digest.hexdigest()


def exported(weights, metadata):
    """The JSON file the live runtime loads. Values are float32 in row-major order."""
    return {
        **metadata,
        "format": SPEC.format,
        "stateSize": STATE_SIZE,
        "actionSize": ACTION_SIZE,
        "weightsSHA256": checksum(weights),
        "weights": {
            name: {
                "shape": list(WEIGHT_SHAPES[name]),
                "values": np.asarray(weights[name], np.float32).ravel().tolist(),
            }
            for name in sorted(WEIGHT_SHAPES)
        },
    }
