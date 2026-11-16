"""Small, trainable Qwen final-MLP LoRA; frozen visual/language features.

The adapter changes the model's last MLP down projection.
Native Qwen normalization and token output projection produce action logits.
No trainable external classifier, vector store, or full-model backward pass.
"""

import hashlib
import json
import math
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
from mlx.utils import tree_flatten, tree_unflatten

from clash_bot.files import atomic_json

FORMAT = "qwen-final-mlp-lora-ppo-v1"


class KLExceeded(ValueError):
    pass


def weights_digest(adapter):
    digest = hashlib.sha256()
    for name, value in tree_flatten(adapter.trainable_parameters()):
        digest.update(name.encode())
        digest.update(memoryview(value.astype(mx.float32).__array__()).tobytes())
    return digest.hexdigest()


class FinalMLPLoRA(nn.Module):
    def __init__(self, input_size, hidden_size, rank=4, alpha=8):
        super().__init__()
        self.scale = alpha / rank
        self.a = mx.random.normal((input_size, rank)) / math.sqrt(input_size)
        self.b = mx.zeros((rank, hidden_size))

    def __call__(self, features):
        return ((features.astype(mx.float32) @ self.a) @ self.b) * self.scale


def action_log_probs(adapter, sample, norm_weight, norm_eps, token_rows, temperature=1.0):
    hidden = sample["base"].astype(mx.float32) + adapter(sample["features"])
    hidden = mx.fast.rms_norm(hidden, norm_weight.astype(mx.float32), norm_eps)
    logits = hidden @ token_rows[mx.array(sample["labels"])].astype(mx.float32).T / temperature
    return logits - mx.logsumexp(logits, axis=-1, keepdims=True)


def clipped_loss(adapter, sample, advantage, norm_weight, norm_eps, token_rows):
    logp = action_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
    old = sample["old_log_probs"]
    ratio = mx.exp(logp[sample["chosen"]] - old[sample["chosen"]])
    surrogate = mx.minimum(ratio * advantage, mx.clip(ratio, 0.8, 1.2) * advantage)
    probs = mx.exp(logp)
    entropy = -mx.sum(probs * logp)
    kl = mx.sum(probs * (logp - old))
    return -surrogate - 0.01 * entropy + 0.02 * kl


def imitation_loss(adapter, sample, norm_weight, norm_eps, token_rows):
    logp = action_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
    # Supervise only the observed card/lane. Sum probability over all compatible
    # candidate placements instead of inventing an exact deployment coordinate.
    target_logp = mx.logsumexp(logp[mx.array(sample["targets"])])
    old = sample["old_log_probs"]
    kl = mx.sum(mx.exp(old) * (old - logp))
    return -sample["confidence"] * target_logp + 0.1 * kl


def search_distillation_loss(adapter, sample, norm_weight, norm_eps, token_rows):
    logp = action_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
    old = sample["old_log_probs"]
    return -mx.sum(mx.array(sample["search_target"]) * logp) + 0.1 * mx.sum(
        mx.exp(old) * (old - logp)
    )


class Learner:
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

    def enter_objective(self, objective):
        previous = self.optimizer
        if self.metadata.get("optimizer_objective") != objective:
            # Adam momentum from opponent imitation must not dictate the next
            # actor/reward gradient (or vice versa). Keep weights, reset moments.
            self.optimizer = optim.Adam(learning_rate=float(previous.learning_rate.item()))
        return previous

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
            mx.sum(mx.exp(self.log_probs(sample))[mx.array(sample["targets"])]).item()
        )
        before_probabilities = [probability(sample) for sample in samples]
        self.optimizer.learning_rate = learning_rate
        grad_fn = nn.value_and_grad(self.adapter, imitation_loss)
        losses = []
        try:
            for sample in samples:
                loss, gradients = grad_fn(
                    self.adapter, sample, self.norm_weight, self.norm_eps, self.token_rows
                )
                mx.eval(loss, gradients)
                flat = tree_flatten(gradients)
                norm = mx.sqrt(sum(mx.sum(gradient * gradient) for _, gradient in flat))
                if not math.isfinite(float(loss.item())) or not math.isfinite(float(norm.item())):
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
                        * (sample["old_log_probs"] - self.log_probs(sample))
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

    def train_batch(self, episodes):
        if (
            not episodes
            or len(episodes) > 2
            or len({item["episode"] for item in episodes}) != len(episodes)
        ):
            raise ValueError("Expected one or two distinct episodes")
        samples = [
            {**sample, "episode_reward": item["reward"], "episode_id": item["episode"]}
            for item in episodes
            for sample in item["samples"]
        ]
        batch = {
            "episodes": [item["episode"] for item in episodes],
            "rewards": [item["reward"] for item in episodes],
        }
        reward = (
            sum(batch["rewards"]) / len(episodes)
            if all(value in (-1, 0, 1) for value in batch["rewards"])
            else None
        )
        return self.train(samples, reward, episodes[0]["episode"], batch=batch)

    def train(self, samples, reward, episode, batch=None):
        previous_optimizer = self.enter_objective("on_policy_ppo")
        rate = float(self.optimizer.learning_rate.item())
        try:
            for attempt in range(4):
                try:
                    return self._train_once(
                        samples, reward, episode, rate * (0.25**attempt), attempt, batch
                    )
                except KLExceeded:
                    # _train_once restores parameters and optimizer state first.
                    continue
            return {
                "updated": False,
                "reason": "kl_or_objective_gate_after_backtracking",
                "version": self.metadata["version"],
            }
        finally:
            self.optimizer.learning_rate = rate
            if self.metadata.get("optimizer_objective") != "on_policy_ppo":
                self.optimizer = previous_optimizer

    def _train_once(self, samples, reward, episode, learning_rate, attempt, batch=None):
        episode_ids = batch["episodes"] if batch else [episode]
        trained = [value in self.metadata["episodes"] for value in episode_ids]
        if all(trained):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.metadata["version"],
            }
        if any(trained):
            raise ValueError("Partially trained batch; do not replay an episode")
        rewards = batch["rewards"] if batch else [reward]
        if any(value not in (-1, 0, 1) for value in rewards) or reward is None or not samples:
            return {"updated": False, "reason": "no_verified_reward_or_actions"}
        if any(sample["version"] != self.metadata["version"] for sample in samples):
            raise ValueError("Off-policy episode: adapter version changed")
        # A single bounded pass over uniformly spaced on-policy decisions.
        indices = sorted(
            set(
                round(i * (len(samples) - 1) / max(1, min(24, len(samples)) - 1))
                for i in range(min(24, len(samples)))
            )
        )
        selected = [samples[i] for i in indices]
        before = {
            name: mx.array(value)
            for name, value in tree_flatten(self.adapter.trainable_parameters())
        }
        optimizer_before = {
            name: mx.array(value) for name, value in tree_flatten(self.optimizer.state)
        }
        before_hash = weights_digest(self.adapter)
        self.optimizer.learning_rate = learning_rate
        before_probabilities = [
            float(mx.exp(self.log_probs(s)[s["chosen"]]).item()) for s in selected
        ]
        # A run of identical losses must not turn the outcome gradient into zero
        # and leave entropy as the only objective. This is a past-data, action-
        # independent control variate; keep it away from the outcome endpoints.
        outcome_baseline = max(-0.5, min(0.5, self.metadata["baseline"]))
        advantage_of = lambda sample: (
            (sample.get("episode_reward", reward) - outcome_baseline)
            * (0.995 ** sample["remaining"])
        )
        objective = lambda: (
            sum(
                float(
                    clipped_loss(
                        self.adapter,
                        sample,
                        advantage_of(sample),
                        self.norm_weight,
                        self.norm_eps,
                        self.token_rows,
                    ).item()
                )
                for sample in selected
            )
            / len(selected)
        )
        objective_before = objective()
        grad_fn = nn.value_and_grad(self.adapter, clipped_loss)
        losses = []
        try:
            for sample in selected:
                advantage = advantage_of(sample)
                loss, gradients = grad_fn(
                    self.adapter,
                    sample,
                    advantage,
                    self.norm_weight,
                    self.norm_eps,
                    self.token_rows,
                )
                mx.eval(loss, gradients)
                flat = tree_flatten(gradients)
                norm = mx.sqrt(sum(mx.sum(g * g) for _, g in flat))
                scale = mx.minimum(1.0, 0.5 / (norm + 1e-8))
                gradients = tree_unflatten([(name, g * scale) for name, g in flat])
                if not math.isfinite(float(loss.item())) or not math.isfinite(float(norm.item())):
                    raise ValueError("Nonfinite learning loss or gradient")
                self.optimizer.update(self.adapter, gradients)
                mx.eval(self.adapter.parameters(), self.optimizer.state)
                losses.append(float(loss.item()))
            kls = [
                float(
                    mx.sum(
                        mx.exp(s["old_log_probs"]) * (s["old_log_probs"] - self.log_probs(s))
                    ).item()
                )
                for s in selected
            ]
            if not all(math.isfinite(k) for k in kls) or max(kls) > 0.15:
                raise KLExceeded("Learning step exceeded KL limit")
            objective_after = objective()
            if not math.isfinite(objective_after) or objective_after >= objective_before - 1e-8:
                raise KLExceeded("Actor update did not improve the full episode objective")
            after_hash = weights_digest(self.adapter)
            if before_hash == after_hash:
                raise ValueError("No adapter weights changed")
            report = {
                "updated": True,
                "algorithm": "clipped_on_policy_policy_gradient",
                "version": self.metadata["version"] + 1,
                "episode": episode,
                "reward": reward,
                "outcome_baseline": outcome_baseline,
                "advantage_min": min(advantage_of(sample) for sample in selected),
                "advantage_max": max(advantage_of(sample) for sample in selected),
                "samples": len(selected),
                "confirmed_decisions": len(samples),
                "learning_rate": learning_rate,
                "backtrack_attempts": attempt,
                "before_sha256": before_hash,
                "after_sha256": after_hash,
                "mean_loss": sum(losses) / len(losses),
                "max_kl": max(kls),
                "objective_before": objective_before,
                "objective_after": objective_after,
                "probability_before": before_probabilities[0],
                "probability_after": float(
                    mx.exp(self.log_probs(selected[0])[selected[0]["chosen"]]).item()
                ),
            }
            if batch:
                report.update(
                    {
                        "episodes": episode_ids,
                        "rewards": rewards,
                        "selected_per_episode": {
                            value: sum(s.get("episode_id") == value for s in selected)
                            for value in episode_ids
                        },
                    }
                )
            metadata = {
                **self.metadata,
                "version": report["version"],
                "optimizer_objective": "on_policy_ppo",
                "baseline": self.metadata["baseline"] * 0.9 + reward * 0.1,
                "episodes": self.metadata["episodes"] + episode_ids,
                "updates": self.metadata["updates"] + len(selected),
                "weights_sha256": after_hash,
                "last_training": report,
            }
            self.save(metadata)
            self.metadata = metadata
            return report
        except Exception:
            self.adapter.update(tree_unflatten(list(before.items())))
            self.optimizer.state = tree_unflatten(list(optimizer_before.items()))
            raise

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
