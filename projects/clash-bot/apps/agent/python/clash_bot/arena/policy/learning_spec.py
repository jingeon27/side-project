"""The shared search target and conservative distillation contract."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, PositiveFloat, PositiveInt

from clash_bot.paths import CONTRACTS_DIR


class LearningSpec(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-search-learning-v6"]
    target: Literal["prior_regularized_action_values"]
    temperature: PositiveFloat
    maxKL: PositiveFloat
    projection: Literal["differentiable_card_partition"]
    maxUpdateKL: PositiveFloat
    maxStateKL: PositiveFloat
    probeRows: PositiveInt
    rolloutSamplesPerCard: PositiveInt
    defensePreferenceWeight: PositiveFloat
    opponentResponse: Literal["frozen_card_policy"]


SPEC = LearningSpec.model_validate_json((CONTRACTS_DIR / "search-learning.json").read_text())
