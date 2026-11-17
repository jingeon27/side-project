"""Learner step distilling soft native-search targets under loss and KL backtracking."""

import math

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten, tree_unflatten

from clash_bot.qwen.learning_policy import search_distillation_loss, weights_digest
from clash_bot.qwen.training_budget import training_work


class SearchDistillation:
    def distill_search(self, samples, dataset, rules_id, epochs=1, rehearsal=False):
        if not rehearsal and dataset in self.metadata.get("search_datasets", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.metadata["version"],
            }
        if not 1 <= len(samples) <= 16:
            raise ValueError("Expected 1..16 search-supervised positions")
        if type(epochs) is not int or not 1 <= epochs <= 4:
            raise ValueError("Expected 1..4 explicit supervised epochs")
        for sample in samples:
            target = sample["search_target"]
            if (
                sample["version"] != self.metadata["version"]
                or len(target) != len(sample["labels"])
                or any(not math.isfinite(p) or p < 0 for p in target)
                or abs(sum(target) - 1) > 1e-4
            ):
                raise ValueError("Invalid search distribution or feature version")
        previous_optimizer = self.enter_objective("search_distillation")
        original_rate = float(self.optimizer.learning_rate.item())
        before = {
            name: mx.array(value)
            for name, value in tree_flatten(self.adapter.trainable_parameters())
        }
        optimizer_before = {
            name: mx.array(value) for name, value in tree_flatten(self.optimizer.state)
        }
        before_hash = weights_digest(self.adapter)
        cross_entropy = lambda sample: float(
            (-mx.sum(mx.array(sample["search_target"]) * self.log_probs(sample))).item()
        )
        initial_loss = sum(cross_entropy(sample) for sample in samples) / len(samples)
        grad_fn = nn.value_and_grad(self.adapter, search_distillation_loss)
        try:
            for attempt in range(4):
                self.adapter.update(tree_unflatten(list(before.items())))
                self.optimizer.state = tree_unflatten(list(optimizer_before.items()))
                self.optimizer.learning_rate = min(original_rate, 1e-5) * 0.25**attempt
                for sample in samples * epochs:
                    with training_work():
                        loss, gradients = grad_fn(
                            self.adapter, sample, self.norm_weight, self.norm_eps, self.token_rows
                        )
                        flat = tree_flatten(gradients)
                        norm = mx.sqrt(sum(mx.sum(g * g) for _, g in flat))
                        mx.eval(loss, norm)
                        if not math.isfinite(float(loss.item())) or not math.isfinite(
                            float(norm.item())
                        ):
                            raise ValueError("Nonfinite search distillation gradient")
                        scale = mx.minimum(1.0, 0.5 / (norm + 1e-8))
                        self.optimizer.update(
                            self.adapter, tree_unflatten([(name, g * scale) for name, g in flat])
                        )
                        mx.eval(self.adapter.parameters(), self.optimizer.state)
                final_loss = sum(cross_entropy(sample) for sample in samples) / len(samples)
                kls = [
                    float(
                        mx.sum(
                            mx.exp(sample["old_log_probs"])
                            * (sample["old_log_probs"] - self.log_probs(sample))
                        ).item()
                    )
                    for sample in samples
                ]
                if not all(math.isfinite(value) for value in [final_loss, *kls]):
                    raise ValueError("Nonfinite search distillation result")
                if final_loss >= initial_loss or max(kls) > 0.02:
                    continue
                after_hash = weights_digest(self.adapter)
                if after_hash == before_hash:
                    continue
                report = {
                    "updated": True,
                    "algorithm": "prioritized_cached_tactical_rehearsal"
                    if rehearsal
                    else "soft_search_policy_distillation",
                    "source": "local_simulation",
                    "rules_id": rules_id,
                    "dataset_sha256": dataset,
                    "version": self.metadata["version"] + 1,
                    "samples": len(samples),
                    "epochs": epochs,
                    "steps": len(samples) * epochs,
                    "before_sha256": before_hash,
                    "after_sha256": after_hash,
                    "cross_entropy_before": initial_loss,
                    "cross_entropy_after": final_loss,
                    "max_kl": max(kls),
                    "backtrack_attempts": attempt,
                    "requires_real_game_evaluation": True,
                }
                metadata = {
                    **self.metadata,
                    "version": report["version"],
                    "weights_sha256": after_hash,
                    "optimizer_objective": "search_distillation",
                    "updates": self.metadata["updates"] + len(samples),
                    "last_training": report,
                    "search_datasets": self.metadata.get("search_datasets", [])
                    + ([] if rehearsal else [dataset]),
                    "tactical_rehearsals": self.metadata.get("tactical_rehearsals", 0)
                    + int(rehearsal),
                    "tactical_gradient_steps": self.metadata.get("tactical_gradient_steps", 0)
                    + len(samples) * epochs,
                }
                self.optimizer.learning_rate = original_rate
                self.save(metadata)
                self.metadata = metadata
                return report
            self.adapter.update(tree_unflatten(list(before.items())))
            self.optimizer.state = tree_unflatten(list(optimizer_before.items()))
            return {
                "updated": False,
                "reason": "search_kl_or_loss_gate",
                "version": self.metadata["version"],
            }
        except Exception:
            self.adapter.update(tree_unflatten(list(before.items())))
            self.optimizer.state = tree_unflatten(list(optimizer_before.items()))
            raise
        finally:
            self.optimizer.learning_rate = original_rate
            if self.metadata.get("optimizer_objective") != "search_distillation":
                self.optimizer = previous_optimizer
