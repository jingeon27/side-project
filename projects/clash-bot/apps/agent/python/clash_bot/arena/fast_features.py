"""Feature vectors of the public decision context; the TypeScript runtime computes the same numbers.

The context is the decision-v3 description that both the live screen and the simulator produce.
Cards and field bodies enter through their attribute vectors in contracts/card-catalogue.json, not
one slot per name: the weights keep their shape for any deck, and a balance patch moves numbers.
Tower hit points are optional: the live screen does not always read them, so training hides them
for part of the samples and the network also learns to act without them.
"""

import hashlib
import math
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, PositiveFloat, PositiveInt

from clash_bot.paths import CONTRACTS_DIR

from .catalogue import current


class Grid(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    columns: PositiveInt
    rows: PositiveInt
    width: PositiveFloat
    height: PositiveFloat


class FastPolicySpec(BaseModel):
    """contracts/fast-policy.json; src/core/policy/fast-policy.ts reads the same file."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-fast-policy-v3"]
    grid: Grid
    clockSeconds: PositiveFloat
    hidden: PositiveInt
    attention: PositiveInt


SPEC = FastPolicySpec.model_validate_json((CONTRACTS_DIR / "fast-policy.json").read_text())
CATALOGUE = current()
CELLS = SPEC.grid.columns * SPEC.grid.rows
TOWERS_KNOWN = 5
HAND = 12
NEXT = HAND + CATALOGUE.card_size
FIELD = NEXT + CATALOGUE.card_size
STATE_SIZE = FIELD + 2 * CATALOGUE.body_size * CELLS
# [wait, ability, card, cost, x, y, x², y²] and the card's attributes.
ACTION_SIZE = 8 + CATALOGUE.card_size
CHANNELS = np.arange(CATALOGUE.body_size) * CELLS
NO_CARD = np.zeros(CATALOGUE.card_size, np.float32)


def cell(x, y):
    # Truncate toward zero like the TypeScript runtime, then keep the cell on the grid.
    column = min(SPEC.grid.columns - 1, max(0, int(x / (SPEC.grid.width / SPEC.grid.columns))))
    row = min(SPEC.grid.rows - 1, max(0, int(y / (SPEC.grid.height / SPEC.grid.rows))))
    return row * SPEC.grid.columns + column


def place(vector, side, body, x, y):
    """Add a body's attributes to its cell; a crowded cell saturates at 1 per attribute."""
    index = FIELD + side * CATALOGUE.body_size * CELLS + CHANNELS + cell(x, y)
    vector[index] = np.minimum(1, vector[index] + body)


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
    # The hand as a bag: four slots' attributes summed and divided by four.
    for card in context["hand"][:4]:
        if card in CATALOGUE.cards:
            vector[HAND:NEXT] += CATALOGUE.cards[card] / 4
    upcoming = [
        CATALOGUE.cards[card] for card in context.get("next") or [] if card in CATALOGUE.cards
    ]
    for card in upcoming:
        vector[NEXT:FIELD] += card / len(upcoming)
    for side, rows in enumerate((context["own"], context["enemy"])):
        for kind, x, y, _variant in rows:
            place(vector, side, CATALOGUE.body_vector(kind), x, y)
    for side, card, x, y, *_age in context.get("effects") or []:
        if card in CATALOGUE.bodies:
            place(vector, 0 if side == "blue" else 1, CATALOGUE.bodies[card], x, y)
    return vector


def hide_towers(vector):
    hidden = vector.copy()
    hidden[TOWERS_KNOWN:HAND] = 0
    return hidden


def action_vector(row):
    """Waiting has no card; the ability carries its hero card's attributes but no position."""
    _letter, kind, card, cost, x, y = row
    attributes = CATALOGUE.cards.get(card, NO_CARD) if card is not None else NO_CARD
    match kind:
        case "card":
            head = [0.0, 0.0, 1.0, cost / 10, x / 18, y / 32, (x / 18) ** 2, (y / 32) ** 2]
        case "ability":
            head = [0.0, 1.0, 0.0, cost / 10, 0.0, 0.0, 0.0, 0.0]
        case "wait":
            head, attributes = [1.0, 0.0, 0.0, cost / 10, 0.0, 0.0, 0.0, 0.0], NO_CARD
        case _:
            raise ValueError(f"Unknown decision action kind: {kind}")
    return [*head, *attributes.tolist()]


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
    """The JSON file the live runtime loads. Values are float32 in row-major order.

    metadata names the version, rule set and card catalogue (`catalogue`) the weights learned
    with; the runtime refuses a catalogue other than its own.
    """
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
