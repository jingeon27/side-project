"""Checksummed adapter checkpoints, per-objective Adam state and the frozen champion guard."""

import json
from pathlib import Path

import mlx.core as mx
import mlx.optimizers as optim
from mlx.utils import tree_flatten, tree_unflatten

from clash_bot.files import atomic_json
from clash_bot.qwen.imitation import Imitation
from clash_bot.qwen.learning_policy import (
    FORMAT,
    action_log_probs,
    policy_log_probs,
    weights_digest,
)
from clash_bot.qwen.policy_gradient import PolicyGradient
from clash_bot.qwen.search_distillation import SearchDistillation


class Learner(SearchDistillation, Imitation, PolicyGradient):
    def __init__(
        self,
        adapter,
        norm_weight,
        norm_eps,
        token_rows,
        directory,
        model_identity,
        target,
        *,
        frozen=False,
    ):
        # The deployed champion only changes through the qualified publication path.
        self.frozen = frozen
        self.adapter = adapter
        self.norm_weight = norm_weight
        self.norm_eps = norm_eps
        self.token_rows = token_rows
        self.directory = Path(directory)
        self.optimizer = optim.Adam(learning_rate=3e-5)
        self.metadata = {
            "format": FORMAT,
            "model_sha256": model_identity,
            "target": target,
            "rank": 4,
            "alpha": 8,
            "input_size": adapter.a.shape[0],
            "hidden_size": adapter.b.shape[1],
            "version": 0,
            "baseline": 0.0,
            "episodes": [],
            "updates": 0,
        }
        pointer = self.directory / "current.json"
        if pointer.exists():
            selected = json.loads(pointer.read_text())
            checkpoint = self.directory / "checkpoints" / f"v{int(selected['version']):06d}"
            metadata = json.loads((checkpoint / "metadata.json").read_text())
            if metadata["format"] != FORMAT or metadata["model_sha256"] != model_identity:
                raise ValueError("Adapter is incompatible with this Qwen model")
            self.adapter.load_weights(str(checkpoint / "adapter.safetensors"), strict=True)
            if weights_digest(self.adapter) != metadata["weights_sha256"]:
                raise ValueError("Adapter checksum mismatch")
            self.optimizer.state = tree_unflatten(
                list(mx.load(str(checkpoint / "optimizer.safetensors")).items())
            )
            self.metadata = {**self.metadata, **metadata}

    def log_probs(self, sample):
        return action_log_probs(
            self.adapter, sample, self.norm_weight, self.norm_eps, self.token_rows
        )

    def policy_log_probs(self, sample):
        return policy_log_probs(
            self.adapter, sample, self.norm_weight, self.norm_eps, self.token_rows
        )

    def enter_objective(self, objective):
        previous = self.optimizer
        if self.metadata.get("optimizer_objective") != objective:
            # Adam momentum from opponent imitation must not dictate the next
            # actor/reward gradient (or vice versa). Keep weights, reset moments.
            self.optimizer = optim.Adam(learning_rate=float(previous.learning_rate.item()))
        return previous

    def save(self, metadata):
        if self.frozen:
            raise ValueError("The deployed champion is frozen; publish only a qualified candidate")
        checkpoint = self.directory / "checkpoints" / f"v{metadata['version']:06d}"
        checkpoint.mkdir(parents=True, exist_ok=True)
        mx.save_safetensors(
            str(checkpoint / "adapter.safetensors"),
            dict(tree_flatten(self.adapter.trainable_parameters())),
        )
        mx.save_safetensors(
            str(checkpoint / "optimizer.safetensors"), dict(tree_flatten(self.optimizer.state))
        )
        atomic_json(checkpoint / "metadata.json", metadata)
        # Publish only after all checksummed checkpoint files have been written.
        atomic_json(
            self.directory / "current.json",
            {"version": metadata["version"], "weights_sha256": metadata["weights_sha256"]},
        )
