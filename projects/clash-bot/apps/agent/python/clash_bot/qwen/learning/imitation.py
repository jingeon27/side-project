"""Learner step cloning observed opponent card/lane choices without degrading actor anchors."""

import json
import math
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten, tree_unflatten

from clash_bot.qwen.learning.learning_policy import KLExceeded, imitation_loss, weights_digest
from clash_bot.qwen.learning.training_budget import training_work


class Imitation:
    def imitate(self, samples, dataset):
        if dataset in self.metadata.get("demonstrations", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.metadata["version"],
            }
        if not samples:
            return {"updated": False, "reason": "no_verified_demonstrations"}
        if len(samples) > 24:
            raise ValueError("Too many demonstration samples")
        for sample in samples:
            if sample["version"] != self.metadata["version"]:
                raise ValueError("Demonstration features use an old adapter version")
            if (
                not sample["targets"]
                or len(set(sample["targets"])) != len(sample["targets"])
                or any(index < 0 or index >= len(sample["labels"]) for index in sample["targets"])
                or not math.isfinite(sample["confidence"])
                or not 0.9 <= sample["confidence"] <= 1
            ):
                raise ValueError("Invalid imitation target or confidence")
        previous_optimizer = self.enter_objective("mirror_actor_imitation")
        original_rate = float(self.optimizer.learning_rate.item())
        try:
            for attempt in range(4):
                try:
                    return self._imitate_once(
                        samples,
                        dataset,
                        min(original_rate, 1e-5) * 0.25**attempt,
                        original_rate,
                        attempt,
                    )
                except KLExceeded:
                    continue
            return {
                "updated": False,
                "reason": "imitation_kl_limit_after_backtracking",
                "version": self.metadata["version"],
            }
        finally:
            self.optimizer.learning_rate = original_rate
            if self.metadata.get("optimizer_objective") != "mirror_actor_imitation":
                self.optimizer = previous_optimizer

    def _imitate_once(self, samples, dataset, learning_rate, original_rate, attempt):
        anchor_file = self.directory / "actor-anchors.json"
        anchors = []
        if self.metadata.get("controller_version") == 3 and anchor_file.exists():
            for row in json.loads(anchor_file.read_text())["samples"]:
                feature = Path(row["path"]).resolve()
                if not feature.is_relative_to(self.directory.resolve() / "features"):
                    raise ValueError("Actor anchor escaped the candidate directory")
                sample = {
                    **mx.load(str(feature)),
                    "labels": row["labels"],
                    "search_target": row["search_target"],
                }
                sample["old_log_probs"] = mx.stop_gradient(self.log_probs(sample))
                anchors.append(sample)
        anchor_loss = lambda: (
            sum(
                float((-mx.sum(mx.array(row["search_target"]) * self.log_probs(row))).item())
                for row in anchors
            )
            / max(1, len(anchors))
        )
        anchor_before = anchor_loss()
        before = {
            name: mx.array(value)
            for name, value in tree_flatten(self.adapter.trainable_parameters())
        }
        optimizer_before = {
            name: mx.array(value) for name, value in tree_flatten(self.optimizer.state)
        }
        before_hash = weights_digest(self.adapter)
        probability = lambda sample: float(
            mx.sum(mx.exp(self.policy_log_probs(sample))[mx.array(sample["targets"])]).item()
        )
        before_probabilities = [probability(sample) for sample in samples]
        self.optimizer.learning_rate = learning_rate
        grad_fn = nn.value_and_grad(self.adapter, imitation_loss)
        losses = []
        try:
            for sample in samples:
                with training_work():
                    loss, gradients = grad_fn(
                        self.adapter, sample, self.norm_weight, self.norm_eps, self.token_rows
                    )
                    mx.eval(loss, gradients)
                    flat = tree_flatten(gradients)
                    norm = mx.sqrt(sum(mx.sum(gradient * gradient) for _, gradient in flat))
                    if not math.isfinite(float(loss.item())) or not math.isfinite(
                        float(norm.item())
                    ):
                        raise ValueError("Nonfinite imitation loss or gradient")
                    scale = mx.minimum(1.0, 0.5 / (norm + 1e-8))
                    self.optimizer.update(
                        self.adapter,
                        tree_unflatten([(name, gradient * scale) for name, gradient in flat]),
                    )
                    mx.eval(self.adapter.parameters(), self.optimizer.state)
                    losses.append(float(loss.item()))
            kls = [
                float(
                    mx.sum(
                        mx.exp(sample["old_log_probs"])
                        * (sample["old_log_probs"] - self.policy_log_probs(sample))
                    ).item()
                )
                for sample in samples
            ]
            after_probabilities = [probability(sample) for sample in samples]
            anchor_after = anchor_loss()
            anchor_kl = max(
                [
                    float(
                        mx.sum(
                            mx.exp(row["old_log_probs"])
                            * (row["old_log_probs"] - self.log_probs(row))
                        ).item()
                    )
                    for row in anchors
                ]
                or [0]
            )
            if anchors and (anchor_after > anchor_before + 0.001 or anchor_kl > 0.005):
                raise KLExceeded("Opponent imitation degraded the actor tactical anchors")
            if (
                not all(math.isfinite(kl) for kl in kls)
                or max(kls) > 0.02
                or sum(after_probabilities) <= sum(before_probabilities)
            ):
                raise KLExceeded(
                    "Imitation update exceeded KL limit or did not improve observed likelihood"
                )
            after_hash = weights_digest(self.adapter)
            if before_hash == after_hash:
                raise ValueError("No imitation adapter weights changed")
            report = {
                "updated": True,
                "algorithm": "mirror_actor_behavior_cloning",
                "version": self.metadata["version"] + 1,
                "dataset_sha256": dataset,
                "samples": len(samples),
                "learning_rate": learning_rate,
                "backtrack_attempts": attempt,
                "before_sha256": before_hash,
                "after_sha256": after_hash,
                "mean_loss": sum(losses) / len(losses),
                "max_kl": max(kls),
                "probability_before": sum(before_probabilities) / len(samples),
                "probability_after": sum(after_probabilities) / len(samples),
                "actor_anchor_samples": len(anchors),
                "actor_loss_before": anchor_before,
                "actor_loss_after": anchor_after,
                "actor_max_kl": anchor_kl,
                "observations": [
                    {
                        "id": sample["id"],
                        "probability_before": before_probability,
                        "probability_after": after_probability,
                    }
                    for sample, before_probability, after_probability in zip(
                        samples, before_probabilities, after_probabilities
                    )
                ],
            }
            metadata = {
                **self.metadata,
                "version": report["version"],
                "optimizer_objective": "mirror_actor_imitation",
                "demonstrations": self.metadata.get("demonstrations", []) + [dataset],
                "updates": self.metadata["updates"] + len(samples),
                "weights_sha256": after_hash,
                "last_training": report,
            }
            self.optimizer.learning_rate = original_rate
            self.save(metadata)
            self.metadata = metadata
            return report
        except Exception:
            self.adapter.update(tree_unflatten(list(before.items())))
            self.optimizer.state = tree_unflatten(list(optimizer_before.items()))
            raise
