"""Exact fallback for native saves rejected by the pinned engine's entity-table validator."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Steps:
    previous: "Steps | None"
    commands: tuple
    ticks: int


def restore(battle, snapshot, initial, latest):
    try:
        battle.load(snapshot)
        return
    except ValueError as exc:
        if str(exc) != "snapshot entity tables are inconsistent" or initial is None:
            raise
    # Only replay the hypothesized world's own command history. Never take a hidden battle
    # state from a training game, patch a rejected native save or substitute a different world.
    steps = []
    while latest is not None:
        steps.append(latest)
        latest = latest.previous
    battle.load(initial)
    for step in reversed(steps):
        battle.step(list(step.commands), step.ticks)
    if battle.save() != snapshot:
        raise ValueError("Deterministic native replay differs from the requested battle snapshot")
