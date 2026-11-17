"""Small action-conditional policy/value network over the public decision context.

The same network guides local search and, published as champion-policy.json, decides live
Counterpush moves in milliseconds (src/core/policy/fast-policy.ts). CPU inference, MLX gradients.
"""

import json
from pathlib import Path

import numpy as np
from more_itertools import chunked

from .context import decision_context
from .fast_features import (
    ACTION_SIZE,
    SPEC,
    STATE_SIZE,
    WEIGHT_SHAPES,
    action_features,
    checksum,
    context_features,
    exported,
    forward,
    hide_towers,
)
from .samples import PolicyMetadata, TrainingSample

FORMAT = "clash-arena-policy-value-v3"
# Leagues are kept per policy format; a new format starts its own league directory.
LEAGUE_KEY = "fast3"
INITIAL_SCALE = {"encoder.weight": 0.04, "query.weight": 0.04, "action.weight": 0.1}


def features(observation, actions):
    context = decision_context(observation, actions)
    return context_features(context), action_features(context)


class Policy:
    def __init__(self, seed=1, weights=None, metadata=None):
        rng = np.random.default_rng(seed)
        self.weights = weights or {
            name: (
                rng.normal(0, INITIAL_SCALE[name], shape)
                if name in INITIAL_SCALE
                else np.zeros(shape)
            ).astype(np.float32)
            for name, shape in WEIGHT_SHAPES.items()
        }
        self.metadata = metadata or {"format": FORMAT, "version": 0}

    def predict(self, observation, actions):
        state, acts = features(observation, actions)
        _logits, probabilities, value = forward(self.weights, state, acts)
        return probabilities, value

    def checksum(self):
        return checksum(self.weights)

    def live(self, catalogue):
        """What `counterpush play` loads: the same weights and checksum as JSON.

        `catalogue` is the card catalogue id of the rule set the weights learned under.
        """
        return exported(
            self.weights,
            {
                **{
                    key: self.metadata[key]
                    for key in ("version", "rulesID")
                    if key in self.metadata
                },
                "catalogue": catalogue,
            },
        )

    def save(self, directory, metadata):
        # Checkpoints keep only the compressed weights. The six times larger live JSON is
        # written when a version is published or exported, not for every learner step.
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=False)
        np.savez_compressed(directory / "weights.npz", **self.weights)
        self.metadata = {
            **self.metadata,
            **metadata,
            "format": FORMAT,
            "weightsSHA256": self.checksum(),
        }
        (directory / "metadata.json").write_text(json.dumps(self.metadata, indent=2) + "\n")

    @classmethod
    def load(cls, directory, rules_id=None):
        directory = Path(directory)
        meta = PolicyMetadata.model_validate_json((directory / "metadata.json").read_text())
        if meta.format != FORMAT or (rules_id and meta.rulesID != rules_id):
            raise ValueError(f"{directory}: policy format or rule set differs from this arena")
        with np.load(directory / "weights.npz", allow_pickle=False) as weights:
            if {name: weights[name].shape for name in weights.files} != WEIGHT_SHAPES:
                raise ValueError(
                    f"{directory}: weights differ from contracts/fast-policy.json; "
                    "change LEAGUE_KEY when the network layout changes"
                )
            policy = cls(
                weights={name: weights[name].copy() for name in weights.files},
                metadata=meta.model_dump(),
            )
        if policy.checksum() != meta.weightsSHA256:
            raise ValueError(f"{directory}: policy checkpoint checksum mismatch")
        return policy

    def train(self, samples, seed, epochs=3, batch_size=32):
        if not samples:
            return {"updated": False, "reason": "no_completed_selfplay_samples"}
        # Validate everything before the first gradient so a bad row cannot half-train the policy.
        rows = [TrainingSample.model_validate(sample) for sample in samples]
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim
        from mlx.utils import tree_flatten

        mx.set_default_device(mx.cpu)
        hidden, attention = SPEC.hidden, SPEC.attention

        class Network(nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = nn.Linear(STATE_SIZE, hidden)
                self.query = nn.Linear(hidden, attention)
                self.action = nn.Linear(ACTION_SIZE, attention)
                self.value = nn.Linear(hidden, 1)

            def __call__(self, states, actions):
                h = nn.relu(self.encoder(states))
                logits = mx.sum(
                    nn.relu(self.action(actions)) * self.query(h)[:, None, :], axis=-1
                ) / (attention**0.5)
                return logits, mx.tanh(self.value(h)).squeeze(-1)

        model = Network()
        model.load_weights(
            [(name, mx.array(value)) for name, value in self.weights.items()], strict=True
        )
        optimizer = optim.Adam(learning_rate=3e-4)

        def loss(model, states, actions, masks, targets, value_targets):
            logits, values = model(states, actions)
            logits = mx.where(masks, logits, -1e9)
            logp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
            policy_loss = -mx.mean(mx.sum(targets * logp, axis=-1))
            return policy_loss + mx.mean((values - value_targets) ** 2)

        gradient = nn.value_and_grad(model, loss)
        rng = np.random.default_rng(seed)
        losses = []
        before = self.checksum()
        for _ in range(epochs):
            for batch in chunked((rows[index] for index in rng.permutation(len(rows))), batch_size):
                width = max(len(row.actions) for row in batch)
                # The live screen does not read tower hit points yet; learn both with and without them.
                states = np.stack(
                    [
                        hide_towers(row.features.dense())
                        if rng.random() < 0.5
                        else row.features.dense()
                        for row in batch
                    ]
                )
                acts = np.zeros((len(batch), width, ACTION_SIZE), np.float32)
                masks = np.zeros((len(batch), width), bool)
                targets = np.zeros((len(batch), width), np.float32)
                for index, row in enumerate(batch):
                    count = len(row.actions)
                    acts[index, :count] = row.actionFeatures
                    masks[index, :count] = True
                    targets[index, :count] = row.target
                # The value head learns the terminal result blended with the tower margin.
                value_targets = np.array([row.value for row in batch], np.float32)
                value, grads = gradient(
                    model, *map(mx.array, (states, acts, masks, targets, value_targets))
                )
                mx.eval(value, grads)
                if not np.isfinite(float(value.item())):
                    raise ValueError("Nonfinite self-play loss")
                optimizer.update(model, grads)
                mx.eval(model.parameters(), optimizer.state)
                losses.append(float(value.item()))
        self.weights = {
            name: np.asarray(value).copy() for name, value in tree_flatten(model.parameters())
        }
        return {
            "updated": before != self.checksum(),
            "beforeSHA256": before,
            "afterSHA256": self.checksum(),
            "samples": len(samples),
            "steps": len(losses),
            "meanLoss": float(np.mean(losses)),
        }
