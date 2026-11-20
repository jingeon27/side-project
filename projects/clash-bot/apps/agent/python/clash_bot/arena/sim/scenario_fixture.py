"""Deterministic tactical positions for tests that need a realistic public observation."""

import numpy as np

from .engine import Arena
from .rules import TILE, Action


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
