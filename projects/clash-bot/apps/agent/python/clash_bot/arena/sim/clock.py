"""Advance hypothetical battles at each side's native decision opportunities."""

from .rules import SPEC, Action

DECISION_TICKS = SPEC["selfplay"]["decisionTicks"]
PLANNING_TICKS = SPEC["selfplay"]["searchTicks"]
WAIT = Action(-1)

if not 0 < DECISION_TICKS <= PLANNING_TICKS or PLANNING_TICKS % DECISION_TICKS:
    raise ValueError("Search windows must span whole decision intervals")


def opponent_offsets(observation, rng, count):
    """Reuse the confirmed command clock, or sample one phase per hidden world."""
    enemy = 1 - observation["team"]
    now = observation["state"]["tick"]
    delay = observation["delays"][enemy]
    phases = {
        (event["tick"] - delay - now) % DECISION_TICKS
        for event in observation["history"]
        if event["tick"] <= now and any(play["team"] == enemy for play in event["plays"])
    }
    if len(phases) == 1:
        return [phases.pop()] * count, "public_execution"
    return rng.integers(DECISION_TICKS, size=count).tolist(), "sampled_unresolved_phase"


def advance_window(world, team, move, ticks, enemy_offset, enemy_move, own_move=None):
    """Apply a planned move and let each native clock observe its own decision ticks.

    The caller can follow a frozen policy between its planned moves, or wait.
    When both sides are due they decide from the same state before either input.
    The return value keeps the branches distinct when their responses differ.
    """
    enemy = 1 - team
    own_ticks = range(0, ticks, DECISION_TICKS) if own_move is not None else (0,)
    enemy_ticks = range(enemy_offset, ticks, DECISION_TICKS)
    events = sorted(set(own_ticks) | set(enemy_ticks))
    branch = []
    for tick, end in zip(events, [*events[1:], ticks]):
        if world.state()["game_over"]:
            break
        actions = [WAIT, WAIT]
        if tick == 0:
            actions[team] = move
        elif tick in own_ticks:
            actions[team] = own_move(world, team)
        if tick in enemy_ticks:
            actions[enemy] = enemy_move(world, enemy)
        if any(row[1] != 0 for row in world.play(actions, end - tick)):
            raise ValueError("Timed rollout rejected a simulated command")
        branch.append((tick, actions[team], actions[enemy]))
    return tuple(branch)
