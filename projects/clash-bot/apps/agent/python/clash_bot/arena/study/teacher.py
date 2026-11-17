"""Counterfactual labels: every legal move against waiting, rolled forward from the same field.

The root world is rebuilt from public plays only. Tower-HP changes and the elixir left after the
same rollout decide the label; no future enemy deployment is supplied.
"""

import json

import numpy as np

from clash_bot.qwen.decision_input import serialize_decision
from clash_bot.qwen.search_data import conservation_frontier

from ..policy.context import decision_context
from ..sim.belief import BeliefSampler
from ..sim.candidates import legal_actions
from ..sim.engine import Arena, public_board
from ..sim.rules import TILE, Action, canonical, digest, rules_identity
from ..training.storage import seed_for


def prompt(observation, actions, types):
    return serialize_decision(decision_context(observation, actions, types))


class Teacher:
    def __init__(self):
        self.root, self.scratch = Arena(1), Arena(2)
        self.types = json.loads(self.root.battle.unit_types_json())
        self.rules_id = rules_identity()["id"]

    def label(self, observation, identity, family, horizon=240):
        root, _attempts = BeliefSampler(
            observation, seed_for("tactical_root", identity)
        ).conditioned(into=self.root)
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
            self.scratch.adopt(snapshot, root)
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
