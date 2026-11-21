"""Small action-conditional policy/value network over the public decision context.

The same network guides local search and, published as champion-policy.json, decides live
live Trophy decisions in milliseconds (src/core/fast/policy.ts). CPU inference, MLX gradients.
"""

import json
from pathlib import Path

import numpy as np

from .context import decision_context
from .features import (
    WEIGHT_SHAPES,
    action_features,
    checksum,
    context_features,
    exported,
    forward,
)
from .samples import PolicyMetadata
from .tactics import action_biases

FORMAT = "clash-arena-policy-value-v4"
# Leagues are kept per policy format; a new format starts its own league directory.
LEAGUE_KEY = "fast4"
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
        context = decision_context(observation, actions)
        del context["towers"]
        return self.read(context)

    def read(self, context):
        """Action probabilities and value of a decision context, however it was read."""
        logits, _probabilities, value = forward(
            self.weights, context_features(context), action_features(context)
        )
        scores = logits + action_biases(context)
        probabilities = np.exp(scores - scores.max())
        probabilities /= probabilities.sum()
        return probabilities, value

    def deployed(self, observation, actions, screen):
        """Probabilities as live play gets them: through its screen, without tower hit points."""
        return self.read(screen.read(observation, actions, towers=False))[0]

    def checksum(self):
        return checksum(self.weights)

    def live(self, catalogue):
        """What `trophy serve --seed` loads: the same weights and checksum as JSON.

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
        from .optimizer import train

        weights, report = train(self.weights, samples, seed, epochs, batch_size)
        self.weights = weights
        return report
