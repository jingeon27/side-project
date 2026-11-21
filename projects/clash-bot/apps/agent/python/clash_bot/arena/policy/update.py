"""Bound the actual dense policy change on deterministic, label-free replay probes."""

import numpy as np

from .features import ACTION_SIZE, forward, hide_towers
from .learning_spec import SPEC


def log_probabilities(weights, row, hidden):
    matrix = row.source.decode()
    state = hide_towers(row.features.dense()) if hidden else row.features.dense()
    logits = forward(weights, state, matrix[:, :ACTION_SIZE])[0]
    scores = logits.astype(np.float64) + matrix[:, -1 if hidden else -2]
    return scores - np.logaddexp.reduce(scores)


def bounded_update(before, proposed, rows, seed):
    if any(not np.isfinite(value).all() for value in proposed.values()):
        raise ValueError("Nonfinite proposed policy weights")
    rng = np.random.default_rng(seed)
    indexes = rng.choice(len(rows), min(SPEC.probeRows, len(rows)), replace=False)
    probes = [
        (rows[index], hidden, log_probabilities(before, rows[index], hidden))
        for index in indexes
        for hidden in (False, True)
    ]

    def measure(weights):
        divergence = [
            float(np.exp(prior) @ (prior - log_probabilities(weights, row, hidden)))
            for row, hidden, prior in probes
        ]
        if not np.isfinite(divergence).all():
            raise ValueError("Nonfinite dense policy divergence")
        divergence = np.maximum(divergence, 0)
        return {"meanKL": float(np.mean(divergence)), "maxKL": max(divergence)}

    raw = measure(proposed)
    for attempt in range(17):
        scale = 0.5**attempt
        weights = {
            name: (value + scale * (proposed[name] - value)).astype(np.float32)
            for name, value in before.items()
        }
        metrics = raw if attempt == 0 else measure(weights)
        if metrics["meanKL"] <= SPEC.maxUpdateKL and metrics["maxKL"] <= SPEC.maxStateKL:
            return weights, {
                **metrics,
                "scale": scale,
                "rawMeanKL": raw["meanKL"],
                "rawMaxKL": raw["maxKL"],
                "probeStates": len(probes),
                "scope": "dense_replay_probes_both_tower_views",
            }
    raise ValueError("No finite policy update satisfied the replay-probe trust region")
