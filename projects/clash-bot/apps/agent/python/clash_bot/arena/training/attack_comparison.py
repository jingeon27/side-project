"""Matched training trials for reserving elixir and spending Graveyard on either tower."""

import random
from dataclasses import asdict, dataclass

import numpy as np

from ..sim.clock import advance_window
from ..sim.rules import CARD_ID, TILE, Action, canonical, command
from .rollout import frozen_move

HORIZON = 240
WAIT = Action(-1)


def alternatives(actions, baseline, team):
    """All indices refer to the real dense legal set. A lane is a trial, never a label."""
    graveyard = [i for i, a in enumerate(actions) if a.card == CARD_ID["Graveyard"]]
    trials = [actions.index(WAIT)]
    for x in (2.5, 15.5):
        if graveyard:
            tx, ty = canonical(x, 25.5, team)
            trials.append(
                min(
                    graveyard,
                    key=lambda i: (actions[i].x / TILE - tx) ** 2 + (actions[i].y / TILE - ty) ** 2,
                )
            )
    return list(dict.fromkeys([baseline, *trials]))


@dataclass
class Result:
    tick: int
    terminal: int | None
    own_hp: int
    enemy_hp: int
    elixir: int
    king_awake: bool


def outcome(world, team):
    state = world.state()
    own, enemy = state["players"][team], state["players"][1 - team]
    result = None
    if state["game_over"]:
        result = 0 if state["winner"] == 2 else 1 if state["winner"] == team else -1
    return Result(
        state["tick"],
        result,
        sum(own["tower_hp"]),
        sum(enemy["tower_hp"]),
        own["elixir_milli"],
        bool(enemy["king_active"]),
    )


def gain(left, right):
    if left.terminal is not None or right.terminal is not None:
        if (
            left.terminal is not None
            and right.terminal is not None
            and left.terminal > right.terminal
        ):
            return left.terminal - right.terminal
        return 0
    saved = left.own_hp - right.own_hp
    dealt = right.enemy_hp - left.enemy_hp
    if (
        left.tick != right.tick
        or saved < 0
        or dealt < 0
        or saved + dealt < 100
        or left.elixir + 1000 < right.elixir
        or left.king_awake > right.king_awake
    ):
        return 0
    return saved + dealt


def compare(scratch, worlds, snapshots, offsets, actions, baseline, team, policies, seed):
    trials = alternatives(actions, baseline, team)
    if len(trials) < 2:
        return None
    outcomes = {i: [] for i in trials}
    # Each seat gets the same random stream on each decision tick of both branches.
    stream = random.Random(seed)
    for source, snapshot, offset in zip(worlds, snapshots, offsets, strict=True):
        world_seed = stream.getrandbits(32)

        def response(world, side, branch_seed=world_seed):
            rng = np.random.default_rng([branch_seed, side, world.state()["tick"]])
            return frozen_move(world, side, policies[side], rng)

        for i in trials:
            scratch.adopt(snapshot, source)
            action = actions[i]
            cmd = command(scratch.battle, action, team, scratch.state())
            if action != WAIT and (cmd is None or scratch.battle.check_deploy(*cmd) != 0):
                continue
            execute_tick = scratch.state()["tick"] + scratch.delays[team]
            start = len(scratch.history)
            advance_window(scratch, team, actions[i], HORIZON, offset, response, response)
            if action != WAIT and not any(
                event["tick"] == execute_tick
                and play["team"] == team
                and play["action"] == action.row()
                for event in scratch.history[start:]
                for play in event["plays"]
            ):
                continue
            outcomes[i].append(outcome(scratch, team))
    pairs = []
    for other in trials[1:]:
        if len(outcomes[baseline]) != len(worlds) or len(outcomes[other]) != len(worlds):
            continue
        for preferred, worse in ((other, baseline), (baseline, other)):
            margins = [
                gain(l, r) for l, r in zip(outcomes[preferred], outcomes[worse], strict=True)
            ]
            if all(margins):
                pairs.append((min(margins), preferred, worse))
    best = max(pairs, default=None)
    return {
        "ticks": HORIZON,
        "worlds": len(worlds),
        "baseline": baseline,
        "tried": trials,
        "actions": [actions[i].row() for i in trials],
        "outcomes": [[asdict(row) for row in outcomes[i]] for i in trials],
        "pair": list(best[1:]) if best else None,
    }
