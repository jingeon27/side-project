"""Visible trophy facts. An omitted fact, empty field and unknown identity have distinct meanings."""

import json
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from clash_bot.paths import CONTRACTS_DIR

CATALOGUE = json.loads((CONTRACTS_DIR / "card-catalogue.json").read_bytes())
UNKNOWN = "unsure"
Side = Literal["blue", "red", "unsure"]
Health = Literal["full", "above_half", "below_half", "unsure"]
Form = Literal["base", "evolution", "hero", "champion", "unsure"]
Reviewer = Literal["visual_assistant", "human"]
Tower = Literal["blueLeft", "blueRight", "blueKing", "redLeft", "redRight", "redKing"]
Number = Annotated[int, Field(ge=0, le=99999)]


class Fields(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)


class Point(Fields):
    x: int = Field(ge=0, lt=368)
    y: int = Field(ge=0, lt=652)
    side: Side = UNKNOWN


class Object(Point):
    kind: str
    form: Form = UNKNOWN
    health: Health = UNKNOWN


class Effect(Point):
    kind: str


class Play(Point):
    card: str
    side: Literal["red"] = "red"


class Slot(Fields):
    card: str = UNKNOWN
    state: Literal["base", "hero", "evolution", "disabled", "unsure"] = UNKNOWN


def known(value, keys):
    if value != UNKNOWN and value not in keys:
        raise ValueError(f"Unknown catalogue identity: {value}")


class Label(Fields):
    format: Literal["trophy-screen-label-v1"] = "trophy-screen-label-v1"
    frameSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")
    reviewer: Reviewer
    objects: list[Object] = Field(default_factory=list, max_length=200)
    objectsComplete: bool = False
    effects: list[Effect] = Field(default_factory=list, max_length=100)
    effectsComplete: bool = False
    opponentPlays: list[Play] = Field(default_factory=list, max_length=40)
    hand: list[Slot] = Field(
        default_factory=lambda: [Slot() for _ in range(4)], min_length=4, max_length=4
    )
    nextCard: str = UNKNOWN
    elixir: Annotated[int, Field(ge=0, le=10)] | Literal["unsure"] = UNKNOWN
    towers: dict[Tower, Number | Literal["unsure"]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def catalogue_facts(self):
        for value in [
            self.nextCard,
            *(s.card for s in self.hand),
            *(p.card for p in self.opponentPlays),
        ]:
            known(value, CATALOGUE["cards"])
        for obj in self.objects:
            known(obj.kind, CATALOGUE["bodies"].keys() - {"?"})
        for effect in self.effects:
            known(effect.kind, CATALOGUE["cards"].keys() | CATALOGUE["bodies"].keys() - {"?"})
        return self
