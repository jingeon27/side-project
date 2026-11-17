"""Feature vectors of the public decision context; the TypeScript runtime computes the same numbers.

The context is the decision-v3 description that both the live screen and the simulator produce.
Cards and field bodies enter through their attribute vectors in contracts/card-catalogue.json, not
one slot per name: the weights keep their shape for any deck, and a balance patch moves numbers.
Field bodies also carry what was seen of them (health, motion), and every candidate placement is
described by where it is relative to the enemies, the threat and the towers, so the policy can
rank any tile rather than a few fixed spots. Tower hit points are optional: the live screen does
not always read them, so training hides them for part of the samples.
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

    format: Literal["clash-fast-policy-v4"]
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
ENEMY_OUT = NEXT + CATALOGUE.card_size
FIELD = ENEMY_OUT + CATALOGUE.card_size
# Per cell: the body attributes, then what was seen of the bodies there.
SEEN = ("healthSeen", "damage", "motionX", "motionY")
CHANNELS = CATALOGUE.body_size + len(SEEN)
STATE_SIZE = FIELD + 2 * CHANNELS * CELLS
RELATIONS = (
    "enemyDistance",
    "enemyDx",
    "enemyDy",
    "threatDistance",
    "threatDy",
    "enemiesInReach",
    "enemyHealthInReach",
    "alliesNear",
    "ownTowerDistance",
    "enemyTowerDistance",
    "leftLane",
    "rightLane",
    "enemySide",
)
# [wait, ability, card, cost, x, y, x², y², evolved], the card's attributes, then RELATIONS.
HEAD = 9
ACTION_SIZE = HEAD + CATALOGUE.card_size + len(RELATIONS)
OWN_TOWERS = np.array([[3.5, 6.5], [14.5, 6.5]])
ENEMY_TOWERS = np.array([[3.5, 25.5], [14.5, 25.5]])
NO_CARD = np.zeros(CATALOGUE.card_size, np.float32)
SPELL = CATALOGUE.catalogue.cardFeatures.index("spell")
SPLASH = CATALOGUE.catalogue.cardFeatures.index("splash")
HITPOINTS = CATALOGUE.catalogue.bodyFeatures.index("hitpoints")
# Motion is in tiles per second; three is a fast unit.
SPEED = 3


def cell(x, y):
    # Truncate toward zero like the TypeScript runtime, then keep the cell on the grid.
    column = min(SPEC.grid.columns - 1, max(0, int(x / (SPEC.grid.width / SPEC.grid.columns))))
    row = min(SPEC.grid.rows - 1, max(0, int(y / (SPEC.grid.height / SPEC.grid.rows))))
    return row * SPEC.grid.columns + column


def seen(body):
    """[healthSeen, damage, motionX, motionY] of one field body, before cell sums."""
    health = CATALOGUE.health(body["kind"], body.get("hp"))
    velocity = body.get("velocity") or (0, 0)
    return [
        0.5 if health is not None else 0.0,
        0.5 * (1 - health) if health is not None else 0.0,
        0.5 * velocity[0] / SPEED,
        0.5 * velocity[1] / SPEED,
    ]


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
        vector[NEXT:ENEMY_OUT] += card / len(upcoming)
    # Opponent cards known to be out of hand, weighted by how many plays they still need.
    for card, low, _high in context.get("enemyCycle") or []:
        if card in CATALOGUE.cards and low > 0:
            vector[ENEMY_OUT:FIELD] += CATALOGUE.cards[card] * min(low, 4) / 16
    # Sum each cell first, then clip once, so the order of bodies never matters.
    field = np.zeros((2, CHANNELS, CELLS), np.float64)
    for side, bodies in enumerate((context["bodies"]["own"], context["bodies"]["enemy"])):
        for body in bodies:
            index = cell(body["x"], body["y"])
            field[side, : CATALOGUE.body_size, index] += CATALOGUE.body_vector(body["kind"])
            field[side, CATALOGUE.body_size :, index] += seen(body)
    for side, card, x, y, *_age in context.get("effects") or []:
        if card in CATALOGUE.bodies:
            field[0 if side == "blue" else 1, : CATALOGUE.body_size, cell(x, y)] += (
                CATALOGUE.bodies[card]
            )
    low = np.zeros(CHANNELS)
    low[-2:] = -1  # motion keeps its direction
    vector[FIELD:] = np.clip(field, low[None, :, None], 1).ravel()
    return vector


def hide_towers(vector):
    hidden = vector.copy()
    hidden[TOWERS_KNOWN:HAND] = 0
    return hidden


def positions(bodies):
    return np.array([[body["x"], body["y"]] for body in bodies], np.float64).reshape(-1, 2)


def relations(context, rows):
    """RELATIONS of each card placement, from the field bodies; zeros for wait and ability."""
    places = np.array([[row[4], row[5]] for row in rows], np.float64).reshape(-1, 2)
    result = np.zeros((len(rows), len(RELATIONS)), np.float64)
    enemies = context["bodies"]["enemy"]
    enemy_at, own_at = positions(enemies), positions(context["bodies"]["own"])
    if len(enemies):
        offset = enemy_at[None, :, :] - places[:, None, :]
        distance = np.hypot(offset[..., 0], offset[..., 1])
        nearest = distance.argmin(axis=1)
        result[:, 0] = np.minimum(1, distance.min(axis=1) / 10)
        result[:, 1:3] = np.clip(offset[np.arange(len(rows)), nearest] / 10, -1, 1)
        reach = np.array(
            [
                CATALOGUE.cards[row[2]][SPLASH] * 4
                if row[2] in CATALOGUE.cards and CATALOGUE.cards[row[2]][SPELL] == 1
                else 2.5
                for row in rows
            ]
        )
        inside = distance <= reach[:, None]
        health = np.array([CATALOGUE.body_vector(body["kind"])[HITPOINTS] for body in enemies])
        result[:, 5] = np.minimum(1, inside.sum(axis=1) / 4)
        result[:, 6] = np.minimum(1, (inside * health[None, :]).sum(axis=1) / 2)
    else:
        result[:, 0] = 1
    # The threat is the invader nearest our king's row, as the candidate rules choose it.
    invaders = [index for index, body in enumerate(enemies) if body["y"] < 16]
    if invaders:
        threat = enemy_at[min(invaders, key=lambda index: enemies[index]["y"])]
        result[:, 3] = np.minimum(1, np.hypot(*(threat[None, :] - places).T) / 10)
        result[:, 4] = np.clip((threat[1] - places[:, 1]) / 10, -1, 1)
    else:
        result[:, 3] = 1
    if len(own_at):
        near = np.hypot(*(own_at[None, :, :] - places[:, None, :]).transpose(2, 0, 1)) <= 3
        result[:, 7] = np.minimum(1, near.sum(axis=1) / 3)
    for column, towers, scale in ((8, OWN_TOWERS, 10), (9, ENEMY_TOWERS, 16)):
        spread = np.hypot(*(towers[None, :, :] - places[:, None, :]).transpose(2, 0, 1))
        result[:, column] = np.minimum(1, spread.min(axis=1) / scale)
    result[:, 10] = places[:, 0] < 8
    result[:, 11] = places[:, 0] > 10
    result[:, 12] = places[:, 1] > 16
    result[[row[1] != "card" for row in rows]] = 0
    return result


def evolved(context, card):
    """1 if the next play of the card is its evolution, 0.5 if it may be, else 0."""
    for name, low, high in context.get("ownEvolution") or []:
        if name == card:
            return 1.0 if high == 0 else 0.5 if low == 0 else 0.0
    return 0.0


def action_vector(context, row):
    """Waiting has no card; the ability carries its hero card's attributes but no position."""
    _letter, kind, card, cost, x, y = row
    attributes = CATALOGUE.cards.get(card, NO_CARD) if card is not None else NO_CARD
    match kind:
        case "card":
            head = [0.0, 0.0, 1.0, cost / 10, x / 18, y / 32, (x / 18) ** 2, (y / 32) ** 2]
            head.append(evolved(context, card))
        case "ability":
            head = [0.0, 1.0, 0.0, cost / 10, 0.0, 0.0, 0.0, 0.0, 0.0]
        case "wait":
            head, attributes = [1.0, 0.0, 0.0, cost / 10, 0.0, 0.0, 0.0, 0.0, 0.0], NO_CARD
        case _:
            raise ValueError(f"Unknown decision action kind: {kind}")
    return [*head, *attributes.tolist()]


def action_features(context):
    rows = context["actions"]
    if not rows:
        return np.zeros((0, ACTION_SIZE), np.float32)
    own = np.array([action_vector(context, row) for row in rows], np.float64)
    return np.concatenate([own, relations(context, rows)], axis=1).astype(np.float32)


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
