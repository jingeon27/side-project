"""Small, trainable Qwen final-MLP LoRA; frozen visual/language features.

The adapter changes the model's last MLP down projection.
Native Qwen normalization and token output projection produce action logits.
No trainable external classifier, vector store, or full-model backward pass.
"""

import hashlib
import math

import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten

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


def policy_log_probs(adapter, sample, norm_weight, norm_eps, token_rows):
    raw = action_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
    bias = sample["policy_bias"]
    if bias.shape != raw.shape:
        raise ValueError("Categorical policy bias does not match the action labels")
    adjusted = raw + bias
    return adjusted - mx.logsumexp(adjusted, axis=-1, keepdims=True)


def clipped_loss(adapter, sample, advantage, norm_weight, norm_eps, token_rows):
    logp = policy_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
    old = sample["old_log_probs"]
    ratio = mx.exp(logp[sample["chosen"]] - old[sample["chosen"]])
    surrogate = mx.minimum(ratio * advantage, mx.clip(ratio, 0.8, 1.2) * advantage)
    probs = mx.exp(logp)
    entropy = -mx.sum(probs * logp)
    kl = mx.sum(probs * (logp - old))
    return -surrogate - 0.01 * entropy + 0.02 * kl


def imitation_loss(adapter, sample, norm_weight, norm_eps, token_rows):
    logp = policy_log_probs(adapter, sample, norm_weight, norm_eps, token_rows)
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
