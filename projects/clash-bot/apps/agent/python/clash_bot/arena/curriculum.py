"""Counterfactual tactical supervision, not invented full-match win labels.

Compare legal moves against waiting from the SAME public field. No future enemy
deployments are supplied. Keep measured tower-HP improvements and resource
tradeoffs; this limited horizon still needs real-game qualification.
"""

import hashlib
import json
from pathlib import Path

import numpy as np

from clash_bot.files import atomic_json
from clash_bot.qwen.decision_input import serialize_decision
from clash_bot.qwen.search_data import conservation_frontier

from .context import NAMES, decision_context
from .engine import (
    TILE,
    Action,
    Arena,
    BeliefSampler,
    canonical,
    digest,
    legal_actions,
    public_board,
    rules_identity,
)
from .export import render
from .selfplay import live_mirror
from .storage import seed_for


def prompt(observation, actions, types):
    return serialize_decision(decision_context(observation, actions, types))


class Teacher:
    def __init__(self):
        self.root, self.scratch = Arena(1), Arena(2)
        self.types = json.loads(self.root.battle.unit_types_json())
        self.rules_id = rules_identity()["id"]

    def label(self, observation, identity, family, horizon=240):
        root = BeliefSampler(observation, seed_for("tactical_root", identity)).sample(
            into=self.root
        )
        if public_board(root.state()) != public_board(observation["state"]):
            return None
        team = observation["team"]
        actions = legal_actions(root.battle, team)
        if Action(-1) not in actions:
            actions.append(Action(-1))
        order = np.random.default_rng(seed_for("tactical_action_order", identity)).permutation(
            len(actions)
        )
        actions = [actions[index] for index in order]
        if len(actions) < 2:
            return None
        snapshot = root.battle.save()
        own_threat = any(
            row[0] != team and row[1] == 3 and canonical(row[3] / TILE, row[4] / TILE, team)[1] < 16
            for row in root.state()["spells"]
        )
        defensive = family in ("scenario-0", "scenario-1", "scenario-2") or own_threat

        def finish(action):
            self.scratch.battle.load(snapshot)
            self.scratch.history = root.history.copy()
            self.scratch.initial_hands, self.scratch.initial_next = (
                root.initial_hands,
                root.initial_next,
            )
            commands = [Action(-1), Action(-1)]
            commands[team] = action
            outcome = self.scratch.play(commands, horizon)
            if any(row[1] != 0 for row in outcome):
                raise ValueError("Counterfactual action was not legal")
            end = self.scratch.state()
            weights = np.array([2.0, 1.0, 1.0])
            own = np.array(end["players"][team]["tower_hp"]) @ weights
            enemy = np.array(end["players"][1 - team]["tower_hp"]) @ weights
            return (
                float(own if defensive else own - enemy),
                end["players"][team]["elixir_milli"],
                end["tick"],
            )

        baseline, baseline_elixir, end_tick = finish(Action(-1))
        ends = [finish(action) for action in actions]
        values = np.array([score - baseline for score, _, _ in ends])
        elixir = [mana for _, mana, _ in ends]
        best = float(values.max())
        viable = values >= best - 35
        costs = np.array(
            [
                0 if a.card == -1 else 2 if a.card == -2 else root.catalogue[a.card][2]
                for a in actions
            ]
        )
        # Keep resource tradeoffs instead of discarding every position without
        # a large tower gain. Mana is measured after the SAME rollout, including
        # regeneration and the ten-elixir cap, not accumulated nominal savings.
        conserving = family in ("scenario-4", "scenario-5") or best < 80
        frontier = conservation_frontier(values, elixir)
        if conserving and (all(frontier) or any(tick != end_tick for _, _, tick in ends)):
            return None
        target = (
            np.array(frontier, dtype=float)
            if conserving
            else np.where(viable, np.exp((values - best) / 50 - 0.15 * costs), 0)
        )
        target /= target.sum()
        return {
            "id": identity,
            "rulesID": self.rules_id,
            "observation": observation,
            "actions": [action.row() for action in actions],
            "target": target.tolist(),
            "evidence": {
                "kind": "paired_elixir_conservation_rollout"
                if conserving
                else "paired_passive_future_rollout",
                "family": family,
                "horizonTicks": horizon,
                "actionOrder": "seeded_permutation",
                "objective": "own_tower_preservation_and_retained_elixir"
                if conserving and defensive
                else "tower_damage_and_retained_elixir"
                if conserving
                else "own_tower_preservation"
                if defensive
                else "tower_damage_difference",
                "futureEnemyDeployments": 0,
                "towerImprovement": values.tolist(),
                "bestImprovement": best,
                "baselineTowerScore": baseline,
                "rootPublicHash": digest(public_board(observation["state"])),
                **(
                    {
                        "elixirCosts": costs.tolist(),
                        "retainedElixirMilli": elixir,
                        "baselineElixirMilli": baseline_elixir,
                    }
                    if conserving
                    else {}
                ),
            },
            "prompt": prompt(observation, actions, self.types),
            "controllerVersion": 3,
        }


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
    for episode in filter(live_mirror, episodes):
        for sample in episode["samples"][::3]:
            obs = sample["observation"]
            if len(obs["state"]["entities"]) < 8:
                continue
            row = teacher.label(
                obs,
                f"{sample['gameID']}-s{sample['team']}-t{obs['state']['tick']}",
                "selfplay-hard-position",
            )
            if row:
                labels.append(row)
            if len(labels) >= count:
                break
        if len(labels) >= count:
            break
    return write_batches(data_dir, labels, episodes[0]["rulesID"]) if labels else []
