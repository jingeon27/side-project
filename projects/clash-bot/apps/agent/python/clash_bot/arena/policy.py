"""Small action-conditional policy/value model; CPU inference, MLX gradients.

Qwen remains the screen model. This model makes thousands of hypothetical local
positions affordable; accepted search targets can be distilled into a separate
Qwen candidate and evaluated before deployment.
"""

import hashlib
import json
from pathlib import Path

import numpy as np

from .engine import FIELDS, TILE, canonical

STATE_SIZE = 480
ACTION_SIZE = 16
FORMAT = "clash-arena-policy-value-v1"


def features(observation):
    state, team = observation["state"], observation["team"]
    own, other = state["players"][team], state["players"][1 - team]
    vector = np.zeros(STATE_SIZE, np.float32)
    vector[:5] = [
        state["tick"] / (state["regular_ticks"] + state["overtime_ticks"]),
        state["elixir_rate"] / 3,
        own["elixir_milli"] / 10000,
        other["elixir_range"][0] / 10,
        other["elixir_range"][1] / 10,
    ]
    vector[5:8] = np.array(own["tower_hp"]) / np.maximum(1, own["tower_max_hp"])
    vector[8:11] = np.array(other["tower_hp"]) / np.maximum(1, other["tower_max_hp"])
    vector[11:16] = [
        own["king_active"],
        other["king_active"],
        own["crowns"] / 3,
        other["crowns"] / 3,
        1,
    ]
    for slot, card in enumerate(own["hand"]):
        if card >= 0:
            vector[16 + slot * 8 + card] = 1
    if own["next_card"] >= 0:
        vector[48 + own["next_card"]] = 1
    for index, row in enumerate(own["evo"][:2]):
        vector[56 + index * 2 : 58 + index * 2] = [row[1] / max(1, row[3]), row[2]]
    if own["abilities"]:
        vector[60:63] = [
            own["abilities"][0][0],
            own["abilities"][0][1],
            own["abilities"][0][2] / 10,
        ]
    recent = [
        play["action"][0]
        for event in observation["history"]
        for play in event["plays"]
        if play["team"] != team and play["action"][0] >= 0
    ][-4:]
    for index, card in enumerate(recent):
        vector[64 + index * 8 + card] = 1
    kinds = _unit_types()
    for row in state["entities"]:
        if row[FIELDS["card_id"]] < 0:
            continue
        kind = kinds[row[FIELDS["unit_type"]]].lower()
        group = (
            1
            if "firespirithut" in kind
            else 2
            if "icewizard" in kind
            else 3
            if "skeleton" in kind
            else 4
            if any(s in kind for s in ("spirit", "speargoblin"))
            else 5
            if "goblinhut" in kind
            else 0
        )
        x, y = canonical(row[FIELDS["x"]] / TILE, row[FIELDS["y"]] / TILE, team)
        cell = min(7, max(0, int(y / 4))) * 3 + min(2, max(0, int(x / 6)))
        channel = group + (0 if row[FIELDS["team"]] == team else 8)
        vector[96 + channel * 24 + cell] += min(2, row[FIELDS["hp"]] / 2000)
    for row in state["spells"]:
        if row[1] not in (3, 6) or row[2] not in (3, 4, 7):
            continue
        x, y = canonical(row[3] / TILE, row[4] / TILE, team)
        cell = min(7, max(0, int(y / 4))) * 3 + min(2, max(0, int(x / 6)))
        channel = (6 if row[1] == 3 else 7) + (0 if row[0] == team else 8)
        vector[96 + channel * 24 + cell] = 1
    return np.clip(vector, -2, 2)


_TYPES = None


def _unit_types():
    global _TYPES
    if _TYPES is None:
        from .engine import new_battle

        _TYPES = json.loads(new_battle().unit_types_json())
    return _TYPES


def action_features(actions, team):
    result = np.zeros((len(actions), ACTION_SIZE), np.float32)
    for index, action in enumerate(actions):
        if action.card >= 0:
            result[index, action.card] = 1
        else:
            result[index, 8 if action.card == -1 else 9] = 1
        x, y = canonical(action.x / TILE, action.y / TILE, team)
        result[index, 10:16] = [
            x / 18,
            y / 32,
            (x / 18) ** 2,
            (y / 32) ** 2,
            float(action.card in (0, 3, 6)),
            float(action.card in (1, 2)),
        ]
    return result


class Policy:
    def __init__(self, seed=1, weights=None, metadata=None):
        rng = np.random.default_rng(seed)
        self.weights = weights or {
            "encoder.weight": rng.normal(0, 0.04, (96, STATE_SIZE)).astype(np.float32),
            "encoder.bias": np.zeros(96, np.float32),
            "query.weight": rng.normal(0, 0.04, (32, 96)).astype(np.float32),
            "query.bias": np.zeros(32, np.float32),
            "action.weight": rng.normal(0, 0.1, (32, ACTION_SIZE)).astype(np.float32),
            "action.bias": np.zeros(32, np.float32),
            "value.weight": np.zeros((1, 96), np.float32),
            "value.bias": np.zeros(1, np.float32),
        }
        self.metadata = metadata or {"format": FORMAT, "version": 0}

    def predict(self, observation, actions):
        state = features(observation)
        acts = action_features(actions, observation["team"])
        w = self.weights
        h = np.maximum(0, state @ w["encoder.weight"].T + w["encoder.bias"])
        query = h @ w["query.weight"].T + w["query.bias"]
        keys = np.maximum(0, acts @ w["action.weight"].T + w["action.bias"])
        logits = keys @ query / np.sqrt(32)
        probabilities = np.exp(logits - np.max(logits))
        probabilities /= probabilities.sum()
        return probabilities, float(np.tanh(h @ w["value.weight"].T + w["value.bias"]).item())

    def checksum(self):
        digest = hashlib.sha256()
        for key, value in sorted(self.weights.items()):
            digest.update(key.encode())
            digest.update(np.asarray(value, np.float32).tobytes())
        return digest.hexdigest()

    def save(self, directory, metadata):
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
        meta = json.loads((directory / "metadata.json").read_text())
        if meta["format"] != FORMAT or (rules_id and meta["rulesID"] != rules_id):
            raise ValueError("Policy format/rule set differs from this arena")
        with np.load(directory / "weights.npz", allow_pickle=False) as weights:
            policy = cls(
                weights={name: weights[name].copy() for name in weights.files}, metadata=meta
            )
        if policy.checksum() != meta["weightsSHA256"]:
            raise ValueError("Policy checkpoint checksum mismatch")
        return policy

    def train(self, samples, seed, epochs=3, batch_size=32):
        if not samples:
            return {"updated": False, "reason": "no_completed_selfplay_samples"}
        for sample in samples:
            target = np.asarray(sample["target"])
            if (
                sample["outcome"] not in (-1, 0, 1)
                or len(target) != len(sample["actions"])
                or not np.all(np.isfinite(target))
                or np.min(target) < 0
                or abs(target.sum() - 1) > 1e-4
            ):
                raise ValueError("Invalid terminal outcome or search visit distribution")
        import mlx.core as mx
        import mlx.nn as nn
        import mlx.optimizers as optim
        from mlx.utils import tree_flatten

        mx.set_default_device(mx.cpu)

        class Network(nn.Module):
            def __init__(self):
                super().__init__()
                self.encoder = nn.Linear(STATE_SIZE, 96)
                self.query = nn.Linear(96, 32)
                self.action = nn.Linear(ACTION_SIZE, 32)
                self.value = nn.Linear(96, 1)

            def __call__(self, states, actions):
                h = nn.relu(self.encoder(states))
                logits = mx.sum(
                    nn.relu(self.action(actions)) * self.query(h)[:, None, :], axis=-1
                ) / (32**0.5)
                return logits, mx.tanh(self.value(h)).squeeze(-1)

        model = Network()
        model.load_weights(
            [(name, mx.array(value)) for name, value in self.weights.items()], strict=True
        )
        optimizer = optim.Adam(learning_rate=3e-4)

        def loss(model, states, actions, masks, targets, outcomes):
            logits, values = model(states, actions)
            logits = mx.where(masks, logits, -1e9)
            logp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
            return -mx.mean(mx.sum(targets * logp, axis=-1)) + mx.mean((values - outcomes) ** 2)

        gradient = nn.value_and_grad(model, loss)
        rng = np.random.default_rng(seed)
        losses = []
        before = self.checksum()
        for _ in range(epochs):
            order = rng.permutation(len(samples))
            for begin in range(0, len(order), batch_size):
                batch = [samples[index] for index in order[begin : begin + batch_size]]
                width = max(len(row["actions"]) for row in batch)
                states = np.stack([row["features"] for row in batch])
                acts = np.zeros((len(batch), width, ACTION_SIZE), np.float32)
                masks = np.zeros((len(batch), width), bool)
                targets = np.zeros((len(batch), width), np.float32)
                for index, row in enumerate(batch):
                    count = len(row["actions"])
                    acts[index, :count] = row["actionFeatures"]
                    masks[index, :count] = True
                    targets[index, :count] = row["target"]
                outcomes = np.array([row["outcome"] for row in batch], np.float32)
                value, grads = gradient(
                    model, *map(mx.array, (states, acts, masks, targets, outcomes))
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
