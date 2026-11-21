"""The pinned native battle core and the rules this project runs it with.

The native engine is used as a dependency, not copied or ported. Its code is MIT;
its underlying game tables have separate ownership (see THIRD_PARTY.md). This module owns
the engine pin, the deck pool, the rule-set identity and the command vocabulary every other
arena module uses; it never plays a game itself.
"""

import hashlib
import json
from dataclasses import dataclass
from typing import Literal

import royalesim
from pydantic import BaseModel, ConfigDict, Field, model_validator

from clash_bot.paths import CONTRACTS_DIR

from ..catalogue import current

SPEC = json.loads((CONTRACTS_DIR / "arena.json").read_text())
OBSERVATION_FORMAT = "clash-arena-observation-v2"
ROLLOUT_CLOCK = "staggered_public_decision_clock_v1"


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


MATCHUP_DECKS = {name: DeckSpec.model_validate(deck) for name, deck in SPEC["decks"].items()}
practice = json.loads((CONTRACTS_DIR / "arena-practice.json").read_bytes())
# A changed table needs fresh receipts before its extra cards can enter the learner.
OMIT_OPENING = frozenset(practice["omitFromStartingHand"])
MINIMUM_LEVELS = practice["minimumLevels"]
FRIENDLY_SPELLS = frozenset(practice["friendlySpells"])
PRACTICE_DECKS = (
    {
        **{
            name: DeckSpec(cards=tuple(cards), forms=(0,) * 8)
            for name, cards in practice["decks"].items()
        },
        **{
            name: DeckSpec.model_validate(deck)
            for name, deck in practice.get("formDecks", {}).items()
        },
    }
    if practice["tableSHA256"] == SPEC["tableSHA256"] and practice["catalogueID"] == current().id
    else {}
)
DECKS = {**MATCHUP_DECKS, **PRACTICE_DECKS}
# The deck the live Trophy screen plays; half of the self-play games mirror it.
LIVE_DECK = SPEC["liveDeck"]
if LIVE_DECK not in DECKS:
    raise ValueError("The live deck must be one of the arena decks")
# One battle catalogue for every pool deck. The live deck comes first so its cards keep ids 0..7.
CARDS = list(
    dict.fromkeys(
        card
        for name in (LIVE_DECK, *sorted(MATCHUP_DECKS), *sorted(PRACTICE_DECKS))
        for card in DECKS[name].cards
    )
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


def new_battle(card_names=None):
    if royalesim.__version__ != SPEC["version"]:
        raise RuntimeError("Engine version differs from the pinned arena rules")
    return royalesim.Battle(
        card_names=CARDS if card_names is None else card_names,
        slot_of_k=[[0, 1, 2], [0, 1, 2]],
        level=SPEC["level"],
        tower_level=SPEC["level"],
        calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
    )


def pinned_table():
    """The client table compiled into the pinned wheel, the one new_battle() runs."""
    stem = SPEC["tableFile"].removeprefix("cards-").removesuffix(".json").replace("-", "_")
    table = json.loads(getattr(royalesim, f"EMBEDDED_CARDS_{stem}_JSON"))
    if table["version"] != SPEC["tableVersion"] or table["version"] != new_battle().card_table():
        raise ValueError("Embedded card table differs from the pinned rules table")
    return table


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
        "evaluationSuite": "rules_scoped_live_mirror_pool_and_self_opening_v5",
        "policyChoice": json.loads((CONTRACTS_DIR / "fast-policy.json").read_text())["choice"],
        "policyMechanics": digest(
            {
                name: json.loads((CONTRACTS_DIR / name).read_text())
                for name in (
                    "fast-tactics.json",
                    "hut-activation.json",
                    "combat-projection.json",
                    "placement-effects.json",
                    "deployment.json",
                )
            }
        ),
        "trainingActor": "champion_search_deployed_learner_mirror_v2",
        "controlObservation": "native_buff_aliases_and_knockback_per_unit_frame_v1",
        "trainingOpponent": "rotating_forms_pressure_funded_and_supported_mirror_v7",
        "tacticalTeacher": "paired_staggered_sampled_public_defender_v2",
        "searchPolicy": "public_outcome_validated_leaf_and_family_trials_v7",
        "rolloutTiming": ROLLOUT_CLOCK,
        "searchLearning": json.loads((CONTRACTS_DIR / "search-learning.json").read_text()),
        # What a policy is given: the live screen's elixir bound, card cycle and health bars, not
        # the engine's exact balances and hit points.
        "policyInput": "live_screen_health_bars_subtile_motion_v3",
        "towerLevels": "side_level_with_rarity_minimum_for_cards_v2",
        "practiceSpec": digest(practice) if PRACTICE_DECKS else None,
        "tacticalActors": "own_live_deck_any_opponent_v1",
        "publicLedger": "confirmed_command_execution_v2",
        "hiddenDraws": "accept_before_execution_fifo_v2",
        "reconstruction": "bounded_mobile_positions_exact_combat_v1",
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
