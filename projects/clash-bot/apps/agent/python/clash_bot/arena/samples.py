"""Stored self-play rows and checkpoint metadata, validated without the native battle engine."""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .fast_features import ACTION_SIZE, STATE_SIZE


class PolicyMetadata(BaseModel):
    """metadata.json of a checkpoint. Training reports and roles stay as extra fields."""

    model_config = ConfigDict(extra="allow")

    format: str
    version: int = Field(ge=0)
    rulesID: str
    weightsSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")


class TrainingSample(BaseModel):
    """One searched position of a completed self-play game."""

    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)

    features: list[float] = Field(min_length=STATE_SIZE, max_length=STATE_SIZE)
    actions: list[list[int]] = Field(min_length=1)
    actionFeatures: list[list[float]]
    target: list[float]
    outcome: int

    @field_validator("outcome")
    @classmethod
    def terminal(cls, value):
        # Truncated games have no outcome; only a native terminal result trains.
        if value not in (-1, 0, 1):
            raise ValueError("outcome must be a terminal -1, 0 or 1")
        return value

    @model_validator(mode="after")
    def distribution(self):
        if len(self.target) != len(self.actions) or len(self.actionFeatures) != len(self.actions):
            raise ValueError("target and action features must cover every action")
        if min(self.target) < 0 or abs(sum(self.target) - 1) > 1e-4:
            raise ValueError("target must be a search visit distribution")
        if any(len(row) != ACTION_SIZE for row in self.actionFeatures):
            raise ValueError("action features have the wrong width")
        return self
