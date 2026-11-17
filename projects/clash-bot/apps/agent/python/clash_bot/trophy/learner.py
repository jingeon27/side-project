"""CPU PPO on verified own Trophy trajectories; no simulator or opponent teacher."""

import json
import tempfile
from pathlib import Path

import numpy as np
from more_itertools import chunked

from clash_bot.arena.policy.features import (
    ACTION_SIZE,
    CATALOGUE,
    SPEC,
    STATE_SIZE,
    WEIGHT_SHAPES,
    checksum,
    exported,
    forward,
)
from clash_bot.files import atomic_json

from .protocol import (
    SETTINGS,
    checked_training_episodes,
    probabilities,
    return_advantage,
    selected_rows,
)


def load_weights(path):
    raw = json.loads(Path(path).read_text())
    if (
        raw.get("format") != SPEC.format
        or raw.get("catalogue") != CATALOGUE.id
        or raw.get("stateSize") != STATE_SIZE
        or raw.get("actionSize") != ACTION_SIZE
        or set(raw["weights"]) != set(WEIGHT_SHAPES)
    ):
        raise ValueError("Expected the current fast policy format")
    weights = {}
    for name, shape in WEIGHT_SHAPES.items():
        row = raw["weights"][name]
        if row["shape"] != list(shape):
            raise ValueError(f"Incorrect shape: {name}")
        values = np.asarray(row["values"], np.float32).reshape(shape)
        if not np.all(np.isfinite(values)):
            raise ValueError("Nonfinite policy weight")
        weights[name] = values
    if checksum(weights) != raw["weightsSHA256"]:
        raise ValueError("Policy checksum mismatch")
    return weights


def save_checkpoint(root, weights, version, behavior_sha, parent_sha, receipt):
    directory = Path(root) / "checkpoints" / f"v{version:06}"
    policy = exported(
        weights,
        {"version": version, "rulesID": "trophy-visible-screen-v1", "catalogue": CATALOGUE.id},
    )
    metadata = {
        "format": SETTINGS["format"],
        "version": version,
        "weightsSHA256": checksum(weights),
        "behaviorSHA256": behavior_sha,
        "championParentSHA256": parent_sha,
        "receipt": receipt,
        "source": "own_screen_actions_and_verified_terminal_result",
    }
    directory.parent.mkdir(parents=True, exist_ok=True)
    if directory.exists():
        existing = json.loads((directory / "metadata.json").read_text())
        if existing != metadata or checksum(load_weights(directory / "policy.json")) != checksum(
            weights
        ):
            raise ValueError("Refusing to replace an immutable Trophy checkpoint")
    else:
        with tempfile.TemporaryDirectory(dir=directory.parent, prefix=".checkpoint-") as temporary:
            path = Path(temporary)
            atomic_json(path / "policy.json", policy)
            atomic_json(path / "metadata.json", metadata)
            path.rename(directory)
    return {
        "checkpoint": str(directory / "policy.json"),
        "version": version,
        "weightsSHA256": checksum(weights),
    }


def prepare_rows(weights, episodes, behavior_sha):
    rows = []
    for episode in checked_training_episodes(episodes, behavior_sha):
        if episode.policy.weightsSHA256 != checksum(weights):
            raise ValueError("Own-policy PPO needs the exact collection checkpoint")
        selected = selected_rows(episode)
        for sample in selected:
            features = sample.features.dense()
            acts = np.asarray(sample.actionFeatures, np.float32)
            logits, _, value = forward(weights, features, acts)
            expected = probabilities(logits, sample.bias, sample.temperature, sample.exploration)
            if not np.allclose(expected, sample.probabilities, atol=2e-5, rtol=2e-4):
                raise ValueError(
                    "Stored behavior differs from the actual policy plus declared biases"
                )
            if abs(value - sample.value) > 2e-4:
                raise ValueError("Stored value differs from collection checkpoint")
            reward = episode.result.reward()
            rows.append(
                {
                    "state": features,
                    "acts": acts,
                    "sample": sample,
                    "reward": reward,
                    "advantage": return_advantage(reward, sample.value),
                    "weight": 1 / len(selected),
                }
            )
    return rows


def maximum_kl(weights, rows):
    values = []
    for row in rows:
        sample = row["sample"]
        logits, _, _ = forward(weights, row["state"], row["acts"])
        new = probabilities(logits, sample.bias, sample.temperature, sample.exploration)
        old = np.asarray(sample.probabilities)
        values.append(float(np.sum(old * (np.log(old) - np.log(new)))))
    return max(values, default=0)


def train(weights, episodes, behavior_sha):
    rows = prepare_rows(weights, episodes, behavior_sha)
    if not rows:
        return weights, {"updated": False, "reason": "no_verified_own_transitions"}
    import mlx.core as mx
    import mlx.nn as nn
    import mlx.optimizers as optim
    from mlx.utils import tree_flatten, tree_map

    mx.set_default_device(mx.cpu)
    config = SETTINGS["ppo"]

    class Network(nn.Module):
        def __init__(self):
            super().__init__()
            self.encoder = nn.Linear(WEIGHT_SHAPES["encoder.weight"][1], SPEC.hidden)
            self.query = nn.Linear(SPEC.hidden, SPEC.attention)
            self.action = nn.Linear(WEIGHT_SHAPES["action.weight"][1], SPEC.attention)
            self.value = nn.Linear(SPEC.hidden, 1)

        def __call__(self, states, actions):
            hidden = nn.relu(self.encoder(states))
            logits = (
                mx.sum(nn.relu(self.action(actions)) * self.query(hidden)[:, None, :], axis=-1)
                / SPEC.attention**0.5
            )
            return logits, mx.tanh(self.value(hidden)).squeeze(-1)

    def loss(
        model,
        states,
        acts,
        masks,
        bias,
        temperatures,
        exploration,
        old,
        chosen,
        advantages,
        rewards,
        row_weights,
    ):
        logits, values = model(states, acts)
        scores = mx.where(masks, (logits + bias) / temperatures[:, None], -1e9)
        probs = (1 - exploration[:, None]) * mx.softmax(scores, axis=-1) + exploration[
            :, None
        ] * masks / mx.sum(masks, axis=-1)[:, None]
        logp = mx.log(mx.maximum(probs, 1e-30))
        selected = mx.take_along_axis(logp, chosen[:, None], axis=1).squeeze(-1)
        old_selected = mx.take_along_axis(old, chosen[:, None], axis=1).squeeze(-1)
        ratio = mx.exp(selected - mx.log(old_selected))
        clipped = mx.clip(ratio, 1 - config["clipRatio"], 1 + config["clipRatio"])
        surrogate = mx.minimum(ratio * advantages, clipped * advantages)
        entropy = -mx.sum(mx.where(masks, probs * logp, 0), axis=-1)
        terms = (
            -surrogate
            + config["valueWeight"] * (values - rewards) ** 2
            - config["entropyWeight"] * entropy
        )
        return mx.sum(row_weights * terms) / mx.sum(row_weights)

    before = checksum(weights)
    attempts = []
    for attempt in range(config["backtracks"]):
        model = Network()
        model.load_weights(
            [(name, mx.array(value)) for name, value in weights.items()], strict=True
        )
        optimizer = optim.Adam(learning_rate=config["learningRate"] * 0.25**attempt)
        gradient = nn.value_and_grad(model, loss)
        losses = []
        rng = np.random.default_rng(711 + attempt)
        for _ in range(config["epochs"]):
            for batch in chunked(
                (rows[i] for i in rng.permutation(len(rows))), config["batchSize"]
            ):
                count, width = len(batch), max(len(row["acts"]) for row in batch)
                actions = np.zeros((count, width, batch[0]["acts"].shape[1]), np.float32)
                masks = np.zeros((count, width), bool)
                bias = np.zeros((count, width), np.float32)
                old = np.ones((count, width), np.float32)
                for i, row in enumerate(batch):
                    n = len(row["acts"])
                    actions[i, :n], masks[i, :n] = row["acts"], True
                    bias[i, :n], old[i, :n] = row["sample"].bias, row["sample"].probabilities
                inputs = [
                    np.stack([row["state"] for row in batch]),
                    actions,
                    masks,
                    bias,
                    np.array([row["sample"].temperature for row in batch], np.float32),
                    np.array([row["sample"].exploration for row in batch], np.float32),
                    old,
                    np.array([row["sample"].chosen for row in batch], np.int32),
                    np.array([row["advantage"] for row in batch], np.float32),
                    np.array([row["reward"] for row in batch], np.float32),
                    np.array([row["weight"] for row in batch], np.float32),
                ]
                value, grads = gradient(model, *map(mx.array, inputs))
                norm = mx.sqrt(sum(mx.sum(g * g) for _, g in tree_flatten(grads)))
                scale = mx.minimum(1, config["gradientNorm"] / (norm + 1e-8))
                grads = tree_map(lambda g: g * scale, grads)
                mx.eval(value, grads)
                if not np.isfinite(float(value.item())):
                    raise ValueError("Nonfinite Trophy PPO loss")
                optimizer.update(model, grads)
                mx.eval(model.parameters(), optimizer.state)
                losses.append(float(value.item()))
        candidate = {
            name: np.asarray(value).copy() for name, value in tree_flatten(model.parameters())
        }
        kl = maximum_kl(candidate, rows)
        attempts.append({"attempt": attempt, "maximumKL": kl})
        if np.isfinite(kl) and kl <= config["maximumKL"]:
            return candidate, {
                "updated": checksum(candidate) != before,
                "beforeSHA256": before,
                "afterSHA256": checksum(candidate),
                "algorithm": "own_trajectory_clipped_ppo",
                "games": len(episodes),
                "samples": len(rows),
                "steps": len(losses),
                "meanLoss": float(np.mean(losses)),
                "maximumKL": kl,
                "attempts": attempts,
            }
    return weights, {
        "updated": False,
        "reason": "policy_KL_limit",
        "beforeSHA256": before,
        "attempts": attempts,
    }
