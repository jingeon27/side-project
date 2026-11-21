"""A small search-only value estimate fitted to native terminal results by whole game."""

import math

import numpy as np

from ..sim.rules import FIELDS, TILE
from .storage import seed_for

MAX_POSITIONS = 32
RIDGE = 0.01


def position(observation):
    """Signed public features from the observer's side. No opponent hand or private balance."""
    state, team = observation["state"], observation["team"]
    own, enemy = state["players"][team], state["players"][1 - team]

    def towers(player):
        return [hp / max(1, full) for hp, full in zip(player["tower_hp"], player["tower_max_hp"])]

    ours, theirs = towers(own), towers(enemy)
    mean_hp = (sum(ours) - sum(theirs)) / 3
    crowns = own["crowns"] - enemy["crowns"]
    weakest = min((hp for hp in ours if hp > 0), default=0) - min(
        (hp for hp in theirs if hp > 0), default=0
    )
    material = pressure = bodies = 0
    for unit in state["entities"]:
        if unit[FIELDS["tower_slot"]] >= 0:
            continue
        side = unit[FIELDS["team"]]
        sign = 1 if side == team else -1
        hp = sign * unit[FIELDS["hp"]] / 4000
        y = unit[FIELDS["y"]] / TILE
        material += hp
        pressure += hp * max(0, ((y if side == 0 else 32 - y) - 12) / 16)
        bodies += sign
    mana = (own["elixir_milli"] / 1000 - sum(enemy["elixir_range"]) / 2) / 10
    return [
        math.tanh(2 * mean_hp + 0.6 * crowns),
        weakest,
        weakest * min(1, state["tick"] / state["regular_ticks"]),
        float(own["king_active"]) - float(enemy["king_active"]),
        mana,
        math.tanh(material),
        math.tanh(pressure),
        math.tanh(bodies / 8),
    ]


def examples(samples):
    if not samples:
        return []
    indexes = np.linspace(0, len(samples) - 1, min(len(samples), MAX_POSITIONS), dtype=int)
    return [[*position(samples[i]["observation"]), samples[i]["outcome"]] for i in indexes]


def fit(episodes, rules_id):
    """Give each completed training game equal weight, validate on disjoint training games."""
    folds = [[], []]
    for game in episodes:
        if (
            not game["completed"]
            or game["rulesID"] != rules_id
            or not game["gameID"].startswith("train-")
            or not game["leafExamples"]
        ):
            continue
        validation = seed_for("leaf-validation", game["gameID"]) % 4 == 0
        folds[validation].append(np.asarray(game["leafExamples"], dtype=np.float64))
    train, validation = folds
    report = {"trainingGames": len(train), "validationGames": len(validation), "weights": None}
    if len(train) < 8 or len(validation) < 3:
        return report
    width = train[0].shape[1] - 1
    gram, rhs = np.eye(width) * RIDGE, np.zeros(width)
    for rows in train:
        x, y = rows[:, :-1], rows[:, -1]
        gram += (x.T @ x) / (len(rows) * len(train))
        rhs += (x.T @ (y - x[:, 0])) / (len(rows) * len(train))
    weights = np.linalg.solve(gram, rhs)
    baseline, fitted = [], []
    for rows in validation:
        x, y = rows[:, :-1], rows[:, -1]
        baseline.append(np.mean((x[:, 0] - y) ** 2))
        fitted.append(np.mean((np.clip(x[:, 0] + x @ weights, -1, 1) - y) ** 2))
    report.update(baselineMSE=float(np.mean(baseline)), fittedMSE=float(np.mean(fitted)))
    if report["fittedMSE"] < report["baselineMSE"] and np.isfinite(weights).all():
        report["weights"] = weights.tolist()
    return report


def estimate(observation, weights):
    x = position(observation)
    value = x[0] if weights is None else x[0] + sum(w * v for w, v in zip(weights, x, strict=True))
    return min(1.0, max(-1.0, value))
