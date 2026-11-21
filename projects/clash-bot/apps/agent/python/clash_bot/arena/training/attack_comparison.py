"""Compare saving elixir and spending an attack card in matched training worlds."""

import random
from dataclasses import asdict, dataclass

import numpy as np

from ..sim.candidates import placements
from ..sim.clock import advance_window
from ..sim.rules import CARD_ID, FIELDS, TILE, Action, canonical, command
from .rollout import frozen_move, rollout_choices

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


def pool_alternatives(actions, baseline, card, prior, team, entities):
    trials = [baseline, actions.index(WAIT)]
    available = [i for i, action in enumerate(actions) if action.card == card]
    for left in (True, False):
        choices = [i for i in available if (actions[i].x < 9 * TILE) == left]
        if choices:
            trials.append(max(choices, key=lambda i: prior[i]))
    placement = placements()[card]
    if available and placement in ("anywhere", "tower_spell", "spawn_spell"):
        for tower in entities:
            if (
                tower[FIELDS["team"]] == team
                or tower[FIELDS["tower_slot"]] not in (1, 2)
                or tower[FIELDS["hp"]] <= 0
            ):
                continue
            x, y = tower[FIELDS["x"]], tower[FIELDS["y"]]
            if placement == "spawn_spell":
                x += -TILE if x < 9 * TILE else TILE
            trials.append(
                min(available, key=lambda i: (actions[i].x - x) ** 2 + (actions[i].y - y) ** 2)
            )
    return list(dict.fromkeys(trials))


def reserve_once(world, team, card, policy, rng, deadline):
    """Both first moves get the same chance to finance one later deployment."""
    state = world.state()
    player = state["players"][team]
    if state["tick"] >= deadline or card not in player["hand"]:
        return frozen_move(world, team, policy, rng)
    cost = player["hand_costs"][player["hand"].index(card)] * 1000
    if player["pending_cost"] or player["elixir_milli"] < cost:
        return WAIT
    actions, prior = rollout_choices(world, team, policy, rng)
    choices = [i for i, action in enumerate(actions) if action.card == card]
    return actions[max(choices, key=lambda i: prior[i])] if choices else WAIT


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


def compare(
    scratch,
    worlds,
    snapshots,
    offsets,
    actions,
    baseline,
    team,
    policies,
    seed,
    pool_card=None,
    prior=None,
):
    trials = (
        alternatives(actions, baseline, team)
        if pool_card is None
        else pool_alternatives(
            actions, baseline, pool_card, prior, team, worlds[0].state()["entities"]
        )
    )
    if len(trials) < 2:
        return None
    outcomes = {i: [] for i in trials}
    casts = {i: [] for i in trials}
    reserving = pool_card is not None and all(a.card != pool_card for a in actions)
    horizon = 480 if pool_card is not None else HORIZON
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
            # Stop reserving immediately after the first confirmed cast, even if the card cycles back.
            reserve_until = scratch.state()["tick"] + 320

            def cast_since_start():
                return any(
                    play["team"] == team and play["action"][0] == pool_card
                    for event in scratch.history[start:]
                    for play in event["plays"]
                )

            def follow(world, side):
                if reserving and not cast_since_start():
                    rng = np.random.default_rng([world_seed, side, world.state()["tick"]])
                    return reserve_once(world, side, pool_card, policies[side], rng, reserve_until)
                return response(world, side)

            advance_window(scratch, team, actions[i], horizon, offset, response, follow)
            if action != WAIT and not any(
                event["tick"] == execute_tick
                and play["team"] == team
                and play["action"] == action.row()
                for event in scratch.history[start:]
                for play in event["plays"]
            ):
                continue
            outcomes[i].append(outcome(scratch, team))
            if pool_card is not None:
                casts[i].append(cast_since_start())
    pairs = []
    for other in trials[1:]:
        if len(outcomes[baseline]) != len(worlds) or len(outcomes[other]) != len(worlds):
            continue
        if pool_card is not None and not all(
            a or b for a, b in zip(casts[baseline], casts[other], strict=True)
        ):
            continue
        for preferred, worse in ((other, baseline), (baseline, other)):
            margins = [
                gain(l, r) for l, r in zip(outcomes[preferred], outcomes[worse], strict=True)
            ]
            if all(margins):
                pairs.append((min(margins), preferred, worse))
    best = max(pairs, default=None)
    return {
        "ticks": horizon,
        **(
            {"poolAttackCard": pool_card, "reserving": reserving, "executedCasts": casts}
            if pool_card is not None
            else {}
        ),
        "worlds": len(worlds),
        "baseline": baseline,
        "tried": trials,
        "actions": [actions[i].row() for i in trials],
        "outcomes": [[asdict(row) for row in outcomes[i]] for i in trials],
        "pair": list(best[1:]) if best else None,
    }
