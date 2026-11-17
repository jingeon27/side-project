"""contracts/card-catalogue.json: attribute vectors of every simulable card and field body.

src/core/card-catalogue.ts reads the same file. `arena catalogue` writes it from the pinned engine
table (catalogue_build.py); this module only reads it, so it runs without the native engine.
"""

import hashlib
import json
from functools import cache
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from clash_bot.paths import CONTRACTS_DIR

PATH = CONTRACTS_DIR / "card-catalogue.json"
Placement = Literal[
    "troop",
    "ranged_troop",
    "building",
    "area_spell",
    "spawn_spell",
    "rolling_spell",
    "tower_spell",
    "anywhere",
    "unsupported",
]


class CardEntry(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    engine: str
    elixir: int = Field(ge=0, le=10)
    placement: Placement
    features: tuple[float, ...]


class Catalogue(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-card-catalogue-v1"]
    # sha256 of the content below; rule sets and live policy files name the catalogue by it.
    id: str
    tableVersion: str
    tableFNV: str
    cardFeatures: tuple[str, ...] = Field(min_length=1)
    bodyFeatures: tuple[str, ...] = Field(min_length=1)
    cards: dict[str, CardEntry]
    bodies: dict[str, tuple[float, ...]]
    bodyHitpoints: dict[str, int]
    units: dict[str, str]

    @model_validator(mode="after")
    def complete(self):
        if any(len(card.features) != len(self.cardFeatures) for card in self.cards.values()):
            raise ValueError("every card needs one value per card feature")
        if any(len(vector) != len(self.bodyFeatures) for vector in self.bodies.values()):
            raise ValueError("every body needs one value per body feature")
        if "?" not in self.bodies or any(body not in self.bodies for body in self.units.values()):
            raise ValueError("every engine unit needs a body, and unknown units need '?'")
        if any(body not in self.bodies or hp <= 0 for body, hp in self.bodyHitpoints.items()):
            raise ValueError("hit points belong to a known body and are positive")
        values = [v for card in self.cards.values() for v in card.features] + [
            v for vector in self.bodies.values() for v in vector
        ]
        if any(not 0 <= value <= 1 for value in values):
            raise ValueError("catalogue values are normalized to 0..1")
        return self


def content_id(catalogue):
    """Independent of the file's formatting: the parsed content, keys sorted, floats as floats."""
    body = catalogue.model_dump(mode="json", exclude={"id"})
    return hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class Lookup:
    """Vectors by the screen's names; unknown bodies read as "?"."""

    def __init__(self, catalogue):
        self.catalogue = catalogue
        self.id = catalogue.id
        self.card_size = len(catalogue.cardFeatures)
        self.body_size = len(catalogue.bodyFeatures)
        self.cards = {
            name: np.array(card.features, np.float32) for name, card in catalogue.cards.items()
        }
        self.bodies = {
            name: np.array(vector, np.float32) for name, vector in catalogue.bodies.items()
        }
        self.by_engine = {card.engine: name for name, card in catalogue.cards.items()}
        self.spell = catalogue.cardFeatures.index("spell")
        self.lifetime = catalogue.cardFeatures.index("lifetime")

    def card(self, name):
        return self.catalogue.cards[name]

    def card_name(self, engine):
        """The screen's name of an engine card record ("BarbLog" -> "barbarian_barrel")."""
        return self.by_engine[engine]

    def body_vector(self, name):
        return self.bodies.get(name, self.bodies["?"])

    def health(self, name, hp):
        """A seen HP range as a fraction of the body's full hit points, or None if unknown."""
        full = self.catalogue.bodyHitpoints.get(name)
        if not full or not hp:
            return None
        return min(1.0, max(0.0, (hp[0] + hp[1]) / 2 / full))

    def lingering(self, name):
        """A spell that stays on the field as an area (poison, graveyard), not a single hit."""
        vector = self.cards.get(name)
        return vector is not None and vector[self.spell] == 1 and vector[self.lifetime] > 0


@cache
def current():
    catalogue = Catalogue.model_validate_json(PATH.read_bytes())
    if content_id(catalogue) != catalogue.id:
        raise ValueError(f"{PATH} changed without `arena catalogue`; its id no longer matches")
    return Lookup(catalogue)
