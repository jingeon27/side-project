"""Only new, sealed own-action training episodes enter the Trophy learner."""

import json
import math
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from clash_bot.arena.policy.features import ACTION_SIZE, STATE_SIZE
from clash_bot.paths import CONTRACTS_DIR

SETTINGS = json.loads((CONTRACTS_DIR / "trophy-learning.json").read_text())
SHA = r"^[a-f0-9]{64}$"


class Strict(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class SparseState(Strict):
    index: list[int]
    value: list[float]

    @model_validator(mode="after")
    def cells(self):
        if len(self.index) != len(self.value) or self.index != sorted(set(self.index)):
            raise ValueError("Sparse state cells must be unique and ordered")
        if self.index and (self.index[0] < 0 or self.index[-1] >= STATE_SIZE):
            raise ValueError("State cell is outside the current policy")
        return self

    def dense(self):
        result = np.zeros(STATE_SIZE, np.float32)
        result[self.index] = self.value
        return result


class Transition(Strict):
    at: float
    image: str = Field(pattern=r"^[a-z0-9_-]+\.png$")
    imageSHA256: str = Field(pattern=SHA)
    features: SparseState
    actionFeatures: list[list[float]] = Field(min_length=1, max_length=26)
    bias: list[float]
    temperature: float = Field(ge=0.25, le=2)
    exploration: float = Field(ge=0, le=0.1)
    probabilities: list[float]
    chosen: int = Field(ge=0)
    value: float = Field(ge=-1, le=1)
    confirmation: Literal["verified_card_input", "verified_wait"]

    @field_validator("actionFeatures")
    @classmethod
    def action_width(cls, rows):
        if any(len(row) != ACTION_SIZE for row in rows):
            raise ValueError("Action features do not match the current policy")
        return rows

    @model_validator(mode="after")
    def distribution(self):
        count = len(self.actionFeatures)
        if len(self.bias) != count or len(self.probabilities) != count or self.chosen >= count:
            raise ValueError("Every action must have a stored probability and bias")
        if min(self.probabilities) <= 0 or abs(sum(self.probabilities) - 1) > 1e-5:
            raise ValueError("Stored behavior must be a positive categorical distribution")
        return self


class Snapshot(Strict):
    checkpoint: str = Field(min_length=1)
    version: int = Field(ge=0)
    weightsSHA256: str = Field(pattern=SHA)


class Result(Strict):
    blue: int = Field(ge=0, le=3)
    red: int = Field(ge=0, le=3)
    outcome: Literal["win", "loss", "draw"]

    @model_validator(mode="after")
    def crowns(self):
        expected = "win" if self.blue > self.red else "loss" if self.blue < self.red else "draw"
        if self.outcome != expected:
            raise ValueError("Outcome contradicts the observed crowns")
        return self

    def reward(self):
        terminal = {"win": 1, "draw": 0, "loss": -1}[self.outcome]
        return 0.8 * terminal + 0.2 * (self.blue - self.red) / 3


class Evidence(Strict):
    image: str = Field(pattern=r"^[a-z0-9_-]+\.png$")
    sha256: str = Field(pattern=SHA)
    at: float


class Episode(Strict):
    format: Literal["trophy-own-trajectory-v1"]
    id: str = Field(pattern=r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")
    role: Literal["training", "baseline", "candidate", "recovery"]
    behaviorSHA256: str = Field(pattern=SHA)
    policy: Snapshot
    result: Result
    resultEvidence: list[Evidence] = Field(min_length=2, max_length=2)
    transitions: list[Transition]
    sent: int = Field(ge=0)
    confirmed: int = Field(ge=0)
    learningEligible: bool

    @model_validator(mode="after")
    def eligible(self):
        first, second = self.resultEvidence
        if (
            first.image == second.image
            or second.at <= first.at
            or (self.transitions and first.at <= self.transitions[-1].at)
        ):
            raise ValueError("Expected two later, distinct result observations")
        if self.confirmed > self.sent:
            raise ValueError("Confirmed inputs exceed sent inputs")
        if self.learningEligible and (
            self.role != "training"
            or self.sent != self.confirmed
            or len(self.transitions) < SETTINGS["minimumTransitions"]
        ):
            raise ValueError("Only sufficiently observed training games with verified inputs train")
        if any(b.at <= a.at for a, b in zip(self.transitions, self.transitions[1:])):
            raise ValueError("Own transitions must advance in time")
        return self


def probabilities(logits, bias, temperature, exploration):
    logits, bias = np.asarray(logits, np.float64), np.asarray(bias, np.float64)
    if (
        logits.ndim != 1
        or not len(logits)
        or logits.shape != bias.shape
        or not 0.25 <= temperature <= 2
        or not 0 <= exploration <= 0.1
    ):
        raise ValueError("Invalid Trophy categorical policy arguments")
    scores = (logits + bias) / temperature
    if not np.all(np.isfinite(scores)):
        raise ValueError("Nonfinite policy score")
    exp = np.exp(scores - scores.max())
    return (1 - exploration) * exp / exp.sum() + exploration / len(scores)


def return_advantage(reward, old_value):
    # A string of losses must not make the policy advantage vanish at critic=-1.
    return reward - float(np.clip(old_value, -0.5, 0.5))


def selected_rows(episode):
    count = len(episode.transitions)
    maximum = SETTINGS["maximumTransitions"]
    # Outcome-independent temporal coverage; never retain only successful actions.
    indices = sorted(set(np.linspace(0, count - 1, min(maximum, count), dtype=int).tolist()))
    return [episode.transitions[index] for index in indices]


def checked_training_episodes(episodes, behavior_sha):
    if not episodes or len({episode.id for episode in episodes}) != len(episodes):
        raise ValueError("Expected unique completed training games")
    for episode in episodes:
        if (
            episode.behaviorSHA256 != behavior_sha
            or not episode.learningEligible
            or episode.role != "training"
        ):
            raise ValueError("Evaluation/read-only/recovery/other-behavior records cannot train")
        if not math.isfinite(episode.result.reward()):
            raise ValueError("Nonfinite terminal reward")
    return episodes
