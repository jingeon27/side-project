"""Counterfactual tactical supervision, not invented full-match win labels.

Compare legal moves against waiting from the SAME public field. No future enemy
deployments are supplied. Keep measured tower-HP improvements and resource
tradeoffs; this limited horizon still needs real-game qualification.
"""

import hashlib
from pathlib import Path

import numpy as np

from clash_bot.files import atomic_json

from ..policy.context import NAMES
from ..sim.engine import Arena
from ..sim.rules import TILE, Action, digest, rules_identity
from ..training.selfplay import live_mirror
from .export import render
from .positions import balanced_positions
from .teacher import Teacher


def scenario(seed, family):
    rng = np.random.default_rng(seed)
    left = bool(rng.integers(2))
    x = 3.5 if left else 14.5
    hands = (
        [6, 4, 3, 7]
        if family == 0
        else [4, 0, 3, 5]
        if family == 1
        else [2, 7, 5, 4]
        if family == 2
        else [4, 2, 6, 3]
        if family == 4
        else [0, 4, 1, 3]
        if family == 5
        else [5, 3, 6, 1]
    )
    if (seed // 4) % 2:
        hands = (
            [6, 0, 3, 7]
            if family == 0
            else [2, 6, 3, 0]
            if family == 2
            else [5, 1, 4, 2]
            if family == 3
            else hands
        )
    own = hands + (
        [6, 2, 5, 7] if family == 5 else [card for card in range(8) if card not in hands]
    )
    enemy = [3, 5, 4, 6, 0, 1, 2, 7]
    arena = Arena(seed, [own, enemy])
    arena.play([Action(-1)] * 2, 100 if family == 5 else int(rng.integers(220, 361)))
    if family in (0, 1):
        arena.play([Action(-1), Action(3, round(x * TILE), round(6.5 * TILE))], 1)
        if seed % 3 == 0:
            arena.play([Action(-1), Action(6, round(x * TILE), round(6.5 * TILE))], 1)
        arena.play([Action(-1)] * 2, int(rng.integers(12, 90)))
    elif family == 2:
        arena.play([Action(-1), Action(5, round(x * TILE), 18 * TILE)], int(rng.integers(25, 150)))
    elif family == 3:
        arena.play([Action(5, round(x * TILE), 14 * TILE), Action(-1)], int(rng.integers(130, 211)))
        if seed % 3 == 0:
            arena.play([Action(-1), Action(4, round(x * TILE), round(25.5 * TILE))], 20)
    elif family == 4:
        # A ready button with no combat: include the real hero and legal skill,
        # Hut and spells, so conserving elixir is learned against those moves.
        arena.play([Action(4, round(x * TILE), 3 * TILE), Action(-1)], 40)
    elif family == 5:
        # At low mana the only alternatives are the ready hero skill and wait.
        # The back-row Barrel is an earlier, public spend, not a hidden balance edit.
        arena.play([Action(0, round(x * TILE), 3 * TILE), Action(-1)], 20)
        arena.play([Action(4, round(x * TILE), 3 * TILE), Action(-1)], 40)
    else:
        raise ValueError("Unknown tactical scenario family")
    return arena.observe(0)


def write_batches(data_dir, labels, rules_id, batch_size=8, split="train"):
    outputs = []
    for begin in range(0, len(labels), batch_size):
        group = labels[begin : begin + batch_size]
        identity = digest(
            {
                "format": 3,
                "ids": [row["id"] for row in group],
                "proof": [row["evidence"] for row in group],
                "prompts": [row["prompt"] for row in group],
            }
        )
        root = (
            Path(data_dir)
            / ("arena/exports" if split == "train" else "arena/tactical-holdout")
            / identity
        )
        path = root / "dataset.json"
        if path.exists():
            outputs.append(str(path))
            continue
        root.mkdir(parents=True, exist_ok=True)
        rows = []
        for index, label in enumerate(group):
            name = f"{index:03d}.png"
            render(label["observation"], root / name)
            rows.append(
                {
                    key: value
                    for key, value in label.items()
                    if key not in ("observation", "actions")
                }
            )
            rows[-1].update(
                {
                    "image": name,
                    "imageSHA256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
                    "choices": list(range(len(label["actions"]))),
                }
            )
        atomic_json(
            path,
            {
                "format": "counterpush-tactical-targets-v3",
                "source": "local_native_counterfactual_v2",
                "controllerVersion": 3,
                "rulesID": rules_id,
                "teacherQualifiedForRealGame": False,
                "trainingEpochs": 3,
                "split": split,
                "samples": rows,
            },
        )
        outputs.append(str(path))
    return outputs


def build(data_dir, count=64, seed=0, split="train"):
    teacher = Teacher()
    labels = []
    for index in range(count):
        family = index % 6
        obs = scenario(seed + index, family)
        row = teacher.label(obs, f"curriculum-{seed}-{index}", f"scenario-{family}")
        if row:
            labels.append(row)
    files = write_batches(data_dir, labels, rules_identity()["id"], split=split)
    return {
        "files": files,
        "positions": len(labels),
        "attempted": count,
        "targetCards": {
            name: sum(
                ("wait" if card == -1 else "ability" if card == -2 else NAMES[card]) == name
                for row in labels
                for card in [row["actions"][int(np.argmax(row["target"]))][0]]
            )
            for name in (*NAMES, "wait", "ability")
        },
    }


def from_selfplay(data_dir, episodes, count=8):
    teacher = Teacher()
    labels = []
    for position in balanced_positions(list(filter(live_mirror, episodes)), count * 8):
        sample = position["sample"]
        obs = sample["observation"]
        row = teacher.label(
            obs,
            f"{position['gameID']}-s{obs['team']}-t{obs['state']['tick']}",
            "selfplay-hard-position",
        )
        if row and any(action[0] == position["focusCard"] for action in row["actions"]):
            row["evidence"]["sampling"] = {
                "scheme": "before_card_opportunities_v1",
                "focusCard": NAMES[position["focusCard"]],
                "timeBucket": position["stage"],
            }
            labels.append(row)
        if len(labels) >= count:
            break
    return write_batches(data_dir, labels, episodes[0]["rulesID"]) if labels else []
