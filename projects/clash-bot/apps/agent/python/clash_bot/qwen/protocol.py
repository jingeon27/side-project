"""Strict wire contracts; model ownership and evidence checks stay in the engine."""

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
)


class Request(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class EmptyRequest(Request):
    op: Literal["status", "warmup", "end_candidate"]


class ChooseRequest(Request):
    op: Literal["choose"]
    images: list[str] = Field(max_length=3)
    prompt: str
    choices: list[int] = Field(min_length=1, max_length=26)
    feature_path: str = Field(min_length=1)
    controller_version: int
    cache_bypass: bool = False

    @field_validator("controller_version")
    @classmethod
    def known_controller(cls, value):
        # The champion keeps controller 1; private candidates use controller 3.
        if value not in (1, 3):
            raise ValueError("Unknown decision controller")
        return value

    @field_validator("choices")
    @classmethod
    def distinct_choices(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Action IDs must be distinct")
        return values


class EpisodeRequest(Request):
    op: Literal["train"]
    episode: str = Field(min_length=1)


class BatchRequest(Request):
    op: Literal["train_batch"]
    episodes: list[str] = Field(min_length=1, max_length=2)

    @field_validator("episodes")
    @classmethod
    def distinct_episodes(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Episode directories must be distinct")
        return values


class DatasetRequest(Request):
    op: Literal["imitate", "study"]
    dataset: str = Field(min_length=1)
    candidate: bool = False


class CheckoutRequest(Request):
    op: Literal["checkout"]
    checkpoint: str | None = None


class CandidateRequest(Request):
    op: Literal["begin_candidate"]
    directory: str = Field(min_length=1)


class ControllerRequest(Request):
    op: Literal["configure_candidate"]
    controller_version: int

    @field_validator("controller_version")
    @classmethod
    def fast_controller(cls, value):
        if value != 3:
            raise ValueError("Candidates use the fast controller")
        return value


class RehearsalRequest(Request):
    op: Literal["rehearse"]
    rounds: int = Field(default=4, ge=1, le=64)


class PromotionRequest(Request):
    op: Literal["promote"]
    checkpoint: str = Field(min_length=1)
    report: str = Field(min_length=1)


LEARNING_REQUEST = TypeAdapter(
    Annotated[
        EmptyRequest
        | ChooseRequest
        | EpisodeRequest
        | BatchRequest
        | DatasetRequest
        | CheckoutRequest
        | CandidateRequest
        | ControllerRequest
        | RehearsalRequest
        | PromotionRequest,
        Field(discriminator="op"),
    ]
)


def parse_learning_request(message):
    return LEARNING_REQUEST.validate_json(message).model_dump(
        mode="json",
        by_alias=True,
        exclude_unset=True,
    )
