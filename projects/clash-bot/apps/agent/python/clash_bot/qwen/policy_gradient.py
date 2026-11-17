"""Learner step for clipped on-policy updates from verified game rewards."""

import math

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten, tree_unflatten

from clash_bot.qwen.learning_policy import KLExceeded, clipped_loss, weights_digest


class PolicyGradient:
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
            float(mx.exp(self.policy_log_probs(s)[s["chosen"]]).item()) for s in selected
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
                        mx.exp(s["old_log_probs"]) * (s["old_log_probs"] - self.policy_log_probs(s))
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
                    mx.exp(self.policy_log_probs(selected[0])[selected[0]["chosen"]]).item()
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
