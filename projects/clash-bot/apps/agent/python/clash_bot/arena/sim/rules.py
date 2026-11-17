"""The pinned native battle core and the rules this project runs it with.

The native engine is used as a dependency, not copied or ported. Its code is MIT;
its underlying game tables have separate ownership (see THIRD_PARTY.md). This module owns
the engine pin, the deck pool, the rule-set identity and the command vocabulary every other
arena module uses; it never plays a game itself.
"""

import hashlib
import json
from dataclasses import dataclass
from typing import Annotated, Literal

import royalesim
from pydantic import BaseModel, ConfigDict, Field, model_validator

from clash_bot.paths import CONTRACTS_DIR

from ..catalogue import current

SPEC = json.loads((CONTRACTS_DIR / "arena.json").read_text())
OBSERVATION_FORMAT = "clash-arena-observation-v2"


class DeploymentSpec(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-deployment-v1"]
    kingTowerTile: tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]]
    kingBackTiles: tuple[
        tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]],
        tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]],
    ]


class DeckSpec(BaseModel):
    """Eight engine cards and each card's form: 0 the card, 1 its evolution, 2 its hero."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    cards: tuple[str, ...] = Field(min_length=8, max_length=8)
    forms: tuple[Literal[0, 1, 2], ...] = Field(min_length=8, max_length=8)

    @model_validator(mode="after")
    def distinct(self):
        if len(set(self.cards)) != len(self.cards):
            raise ValueError("a deck holds eight different cards")
        return self


DEPLOYMENT = DeploymentSpec.model_validate_json((CONTRACTS_DIR / "deployment.json").read_text())
DECKS = {name: DeckSpec.model_validate(deck) for name, deck in SPEC["decks"].items()}
# The deck the live screen plays; Counterpush is a mirror match of it.
LIVE_DECK = SPEC["liveDeck"]
if LIVE_DECK not in DECKS:
    raise ValueError("The live deck must be one of the arena decks")
# One battle catalogue for every pool deck. The live deck comes first so its cards keep ids 0..7,
# which the Qwen study exports of live-mirror games still index.
CARDS = list(
    dict.fromkeys(card for name in (LIVE_DECK, *sorted(DECKS)) for card in DECKS[name].cards)
)
CARD_ID = {card: index for index, card in enumerate(CARDS)}
TILE = 1000 * royalesim.SUBTILE_PER_MILLITILE
FIELDS = {name: index for index, name in enumerate(royalesim.ENTITY_FIELDS)}
EXPECTED_FIELDS = ["uid", "team", "kind", "card_id", "tower_slot", "x", "y", "hp", "max_hp"]
if list(royalesim.ENTITY_FIELDS[:9]) != EXPECTED_FIELDS:
    raise RuntimeError("Unrecognized native entity ABI")


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def deck_ids(name):
    return [CARD_ID[card] for card in DECKS[name].cards]


def forms_of(name, order):
    form = dict(zip(deck_ids(name), DECKS[name].forms))
    return [form[card] for card in order]


def new_battle():
    if royalesim.__version__ != SPEC["version"]:
        raise RuntimeError("Engine version differs from the pinned arena rules")
    return royalesim.Battle(
        card_names=CARDS,
        slot_of_k=[[0, 1, 2], [0, 1, 2]],
        level=SPEC["level"],
        tower_level=SPEC["level"],
        calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
    )


def rules_identity():
    battle = new_battle()
    data = royalesim.data_dir()
    identity = {
        "engine": SPEC["engine"],
        "engineVersion": royalesim.__version__,
        "commit": battle.provenance()[0],
        "table": battle.card_table(),
        "tableFNV": battle.card_table_fnv1a64(),
        # Current tables are compiled into the wheel. The source hash
        # is pinned from its verified sdist; FNV is the running table's.
        "tableSourceSHA256": SPEC["tableSHA256"],
        "wheelSHA256": SPEC["sha256"],
        "calibrationSHA256": hashlib.sha256((data / "calibration.json").read_bytes()).hexdigest(),
        "cards": CARDS,
        "decks": {name: deck.model_dump(mode="json") for name, deck in sorted(DECKS.items())},
        "liveDeck": LIVE_DECK,
        "level": SPEC["level"],
        # Visibility and timing alter the information set/returns just as a balance patch does.
        "observationFormat": OBSERVATION_FORMAT,
        "opponentDeck": "public_play_inferred_pool_prior",
        "evaluationSuite": "live_mirror_and_pool_v2",
        "tacticalActors": "own_live_deck_any_opponent_v1",
        "selfplay": SPEC["selfplay"],
        "liveCommandDelayTicks": SPEC["liveCommandDelayTicks"],
        # Policy inputs read cards through this catalogue; a new one is a new rule set.
        "catalogue": current().id,
    }
    if identity["tableFNV"] != SPEC["tableFNV"] or identity["commit"] != SPEC["commit"]:
        raise ValueError("Native rules/provenance mismatch")
    return {**identity, "id": digest(identity)}


@dataclass(frozen=True)
class Action:
    card: int  # -1 wait, -2 ability; otherwise the battle catalogue id (CARDS), never a hand slot
    x: int = 0
    y: int = 0

    def row(self):
        return [self.card, self.x, self.y]


def canonical(x, y, team):
    return (x, y) if team == 0 else (18 - x, 32 - y)


def command(battle, action, team, state=None):
    if action.card == -1:
        return None
    state = state or json.loads(battle.state_json())
    if action.card == -2:
        return (team, royalesim.HAND_SIZE, 0, 0)
    hand = state["players"][team]["hand"]
    if action.card not in hand:
        return None
    return (team, hand.index(action.card), action.x, action.y)
