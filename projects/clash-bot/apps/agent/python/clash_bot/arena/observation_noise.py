"""What the live screen gets wrong, applied to self-play training inputs.

The screen misses units, cannot name some, places them a little off and rarely sees health or
motion. Training reads its positions through these errors while search and labels keep the true
game, so the policy learns to act on an imperfect reading instead of a perfect simulator view.
"""

import copy

from pydantic import BaseModel, ConfigDict, Field


class PerceptionNoise(BaseModel):
    """contracts/arena.json selfplay.perception; rates are per body or effect."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    missRate: float = Field(ge=0, le=1)
    unknownRate: float = Field(ge=0, le=1)
    jitterTiles: float = Field(ge=0)
    motionSeenRate: float = Field(ge=0, le=1)
    healthSeenRate: float = Field(ge=0, le=1)
    effectMissRate: float = Field(ge=0, le=1)


def perceive(context, rng, noise):
    """A copy of the decision context as the screen might read it."""

    def body(seen):
        if rng.random() < noise.missRate:
            return None
        jitter = rng.uniform(-noise.jitterTiles, noise.jitterTiles, 2)
        return {
            **seen,
            "kind": "?" if rng.random() < noise.unknownRate else seen["kind"],
            "x": seen["x"] + float(jitter[0]),
            "y": seen["y"] + float(jitter[1]),
            "velocity": seen["velocity"] if rng.random() < noise.motionSeenRate else None,
            "hp": seen["hp"] if rng.random() < noise.healthSeenRate else None,
        }

    read = copy.copy(context)
    read["bodies"] = {
        side: [row for row in map(body, context["bodies"][side]) if row is not None]
        for side in ("own", "enemy")
    }
    read["effects"] = [
        effect for effect in context.get("effects") or [] if rng.random() >= noise.effectMissRate
    ]
    return read
