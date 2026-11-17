"""Stored self-play rows and checkpoint metadata, validated without the native battle engine."""

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .features import ACTION_SIZE, STATE_SIZE


class PolicyMetadata(BaseModel):
    """metadata.json of a checkpoint. Training reports and roles stay as extra fields."""

    model_config = ConfigDict(extra="allow")

    format: str
    version: int = Field(ge=0)
    rulesID: str
    weightsSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")


class SparseFeatures(BaseModel):
    """A state vector stored by its nonzero cells; most of the field grid is empty."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    index: list[int]
    value: list[float]

    @model_validator(mode="after")
    def cells(self):
        if len(self.index) != len(self.value):
            raise ValueError("every stored cell needs one value")
        if self.index != sorted(set(self.index)) or (self.index and self.index[0] < 0):
            raise ValueError("cells must be unique and increasing")
        if self.index and self.index[-1] >= STATE_SIZE:
            raise ValueError("cell outside the state vector")
        return self

    @classmethod
    def of(cls, vector):
        index = np.flatnonzero(vector)
        return cls(index=index.tolist(), value=np.asarray(vector)[index].astype(float).tolist())

    def dense(self):
        vector = np.zeros(STATE_SIZE, np.float32)
        vector[self.index] = self.value
        return vector


def value_target(outcome, margin):
    """Half the terminal result, half the tower hit-point margin; separates a 0:3 from a 2:3 loss."""
    return 0.5 * outcome + 0.5 * float(np.clip(margin, -1, 1))


class TrainingSample(BaseModel):
    """One searched position of a completed self-play game."""

    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)

    features: SparseFeatures
    actions: list[list[int]] = Field(min_length=1)
    actionFeatures: list[list[float]]
    actionBias: list[float]
    actionBiasWithoutTowers: list[float]
    actionLogMassCorrection: list[float]
    actionLogMassCorrectionWithoutTowers: list[float]
    target: list[float]
    outcome: int
    value: float = Field(ge=-1, le=1)

    @field_validator("outcome")
    @classmethod
    def terminal(cls, value):
        # Truncated games have no outcome; only a native terminal result trains.
        if value not in (-1, 0, 1):
            raise ValueError("outcome must be a terminal -1, 0 or 1")
        return value

    @model_validator(mode="after")
    def distribution(self):
        if any(
            len(rows) != len(self.actions)
            for rows in (
                self.target,
                self.actionFeatures,
                self.actionBias,
                self.actionBiasWithoutTowers,
                self.actionLogMassCorrection,
                self.actionLogMassCorrectionWithoutTowers,
            )
        ):
            raise ValueError("target and action features must cover every action")
        if min(self.target) < 0 or abs(sum(self.target) - 1) > 1e-4:
            raise ValueError("target must be a searched policy distribution")
        if any(len(row) != ACTION_SIZE for row in self.actionFeatures):
            raise ValueError("action features have the wrong width")
        return self
