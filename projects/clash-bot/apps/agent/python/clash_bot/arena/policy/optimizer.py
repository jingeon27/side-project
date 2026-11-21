"""Exact dense card partitions, matched-view targets and bounded shared-head updates."""

import time

import numpy as np
from more_itertools import chunked

from .features import ACTION_SIZE, SPEC, STATE_SIZE, checksum, hide_towers
from .learning_spec import SPEC as LEARNING
from .samples import TrainingSample
from .update import bounded_update


def project_scores(scores, families, retained, source_mask, retained_mask):
    """Autodiff includes every legal position in its card's partition."""
    import mlx.core as mx

    kept = mx.take_along_axis(scores, retained, axis=1)
    kept_family = mx.take_along_axis(families, retained, axis=1)
    full_group = (kept_family[:, :, None] == families[:, None, :]) & source_mask[:, None, :]
    kept_group = (kept_family[:, :, None] == kept_family[:, None, :]) & retained_mask[:, None, :]
    full_mass = mx.logsumexp(mx.where(full_group, scores[:, None, :], -1e9), axis=-1)
    kept_mass = mx.logsumexp(mx.where(kept_group, kept[:, None, :], -1e9), axis=-1)
    return mx.where(retained_mask, kept + full_mass - kept_mass, -1e9)


def defense_loss(scores, families, source_mask, pairs, pair_mask):
    """Rank positions within a card and full card masses across different cards."""
    import mlx.core as mx

    if not pairs.shape[1]:
        return mx.array(0.0)
    flat = pairs.reshape((pairs.shape[0], -1))
    picked = mx.take_along_axis(scores, flat, axis=1).reshape(pairs.shape)
    cards = mx.take_along_axis(families, flat, axis=1).reshape(pairs.shape)
    groups = (cards[..., None] == families[:, None, None, :]) & source_mask[:, None, None, :]
    mass = mx.logsumexp(mx.where(groups, scores[:, None, None, :], -1e9), axis=-1)
    same = cards[..., 0] == cards[..., 1]
    compared = mx.where(same[..., None], picked, mass)
    difference = compared[..., 0] - compared[..., 1]
    losses = mx.where(pair_mask, mx.logaddexp(0.0, -difference), 0.0)
    return mx.sum(losses) / mx.maximum(1, mx.sum(pair_mask))


def batch_arrays(rows, hidden):
    width = max(row.source.count for row in rows)
    keep = max(len(row.actions) for row in rows)
    states = np.stack(
        [
            hide_towers(row.features.dense()) if hide else row.features.dense()
            for row, hide in zip(rows, hidden)
        ]
    )
    actions = np.zeros((len(rows), width, ACTION_SIZE), np.float32)
    biases = np.zeros((len(rows), width), np.float32)
    families = np.zeros((len(rows), width), np.int32)
    source_mask = np.zeros((len(rows), width), bool)
    retained_mask = np.zeros((len(rows), keep), bool)
    retained = np.zeros((len(rows), keep), np.int32)
    targets = np.zeros((len(rows), keep), np.float32)
    ranked = [row.defensePairs + row.attackPairs for row in rows]
    pairs = np.zeros((len(rows), max(map(len, ranked)), 2), np.int32)
    pair_mask = np.zeros(pairs.shape[:2], bool)
    for index, (row, hide) in enumerate(zip(rows, hidden)):
        matrix = row.source.decode()
        count, selected = row.source.count, len(row.actions)
        actions[index, :count] = matrix[:, :ACTION_SIZE]
        biases[index, :count] = matrix[:, -1 if hide else -2]
        families[index, :count] = matrix[:, ACTION_SIZE]
        source_mask[index, :count] = True
        retained_mask[index, :selected] = True
        retained[index, :selected] = row.source.retained
        targets[index, :selected] = row.targetWithoutTowers if hide else row.target
        if ranked[index]:
            pairs[index, : len(ranked[index])] = ranked[index]
            pair_mask[index, : len(ranked[index])] = True
    values = np.array([row.value for row in rows], np.float32)
    return (
        states,
        actions,
        biases,
        families,
        retained,
        source_mask,
        retained_mask,
        targets,
        values,
        pairs,
        pair_mask,
    )


def train(weights, samples, seed, epochs=3, batch_size=32):
    if not samples:
        return weights, {"updated": False, "reason": "no_completed_selfplay_samples"}
    if epochs < 1 or batch_size < 1:
        raise ValueError("Training epochs and batch size must be positive")
    # Reject incomplete/old tensors before taking any gradient; keep compressed replay in memory.
    rows = [TrainingSample.model_validate(sample) for sample in samples]
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten

    mx.set_default_device(mx.cpu)

    class Network(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.Linear(STATE_SIZE, SPEC.hidden)
            self.query = nn.Linear(SPEC.hidden, SPEC.attention)
            self.action = nn.Linear(ACTION_SIZE, SPEC.attention)
            self.value = nn.Linear(SPEC.hidden, 1)

        def __call__(self, states, actions):
            hidden = nn.relu(self.encoder(states))
            logits = mx.sum(nn.relu(self.action(actions)) * self.query(hidden)[:, None, :], axis=-1)
            return logits / (SPEC.attention**0.5), mx.tanh(self.value(hidden)).squeeze(-1)

    model = Network()
    model.load_weights([(name, mx.array(value)) for name, value in weights.items()], strict=True)
    optimizer = optim.Adam(learning_rate=3e-4)

    def loss(
        model,
        states,
        actions,
        biases,
        families,
        retained,
        source_mask,
        retained_mask,
        targets,
        values,
        pairs,
        pair_mask,
    ):
        logits, predictions = model(states, actions)
        dense = logits + biases
        scores = project_scores(dense, families, retained, source_mask, retained_mask)
        logp = scores - mx.logsumexp(scores, axis=-1, keepdims=True)
        policy = -mx.mean(mx.sum(targets * logp, axis=-1))
        value = mx.mean((predictions - values) ** 2)
        paired = defense_loss(dense, families, source_mask, pairs, pair_mask)
        return policy + value + LEARNING.defensePreferenceWeight * paired

    gradient = nn.value_and_grad(model, loss)
    rng = np.random.default_rng(seed)
    losses = []
    began = time.perf_counter()
    for _ in range(epochs):
        for batch in chunked((rows[i] for i in rng.permutation(len(rows))), batch_size):
            arrays = batch_arrays(batch, [rng.random() < 0.5 for row in batch])
            value, grads = gradient(model, *map(mx.array, arrays))
            mx.eval(value, grads)
            if not np.isfinite(float(value.item())):
                raise ValueError("Nonfinite self-play loss")
            optimizer.update(model, grads)
            mx.eval(model.parameters(), optimizer.state)
            losses.append(float(value.item()))
    proposed = {name: np.asarray(value).copy() for name, value in tree_flatten(model.parameters())}
    accepted, constraint = bounded_update(weights, proposed, rows, seed)
    before, after = checksum(weights), checksum(accepted)
    return accepted, {
        "updated": before != after,
        "beforeSHA256": before,
        "afterSHA256": after,
        "samples": len(rows),
        "steps": len(losses),
        "meanLoss": float(np.mean(losses)),
        "lossScope": "optimizer_proposal_before_bounded_update",
        "seconds": time.perf_counter() - began,
        "policyUpdate": constraint,
    }
