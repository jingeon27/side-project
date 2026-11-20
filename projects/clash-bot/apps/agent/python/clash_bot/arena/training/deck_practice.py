"""Regular deck coverage through legal opening positions and frozen-policy games."""

from functools import cache

import numpy as np

from ..catalogue import current
from ..sim.rules import DECKS, LIVE_DECK, OMIT_OPENING, PRACTICE_DECKS, Action, deck_ids
from .storage import seed_for

# Both players wait through their normal elixir recharge. Even the most expensive pool card
# can then enter the searched candidates when drawn in the opening four.
OPENING_TICKS = 224


@cache
def rotation():
    lookup = current()
    return sorted(
        set(DECKS) - {LIVE_DECK},
        key=lambda name: (
            name not in PRACTICE_DECKS,
            -lookup.card(lookup.card_name(DECKS[name].cards[0])).elixir,
            name,
        ),
    )


def schedule_deck(setup, index, seat):
    names = rotation()
    deck = names[index % len(names)]
    decks = [LIVE_DECK, LIVE_DECK]
    decks[seat] = deck
    eligible = [card for card in DECKS[deck].cards if card not in OMIT_OPENING]
    lead = eligible[(index // len(names)) % len(eligible)]
    return {**setup, "decks": decks, "practiceDeck": deck, "practiceLead": lead}


def practice_orders(setup, seat, game_id):
    rng = np.random.default_rng(seed_for("deck_practice_opening", game_id))
    orders = [rng.permutation(deck_ids(deck)).tolist() for deck in setup["decks"]]
    deck = setup["practiceDeck"]
    lead = deck_ids(deck)[DECKS[deck].cards.index(setup["practiceLead"])]
    orders[seat].remove(lead)
    orders[seat].insert(0, lead)
    return orders


def open_practice(arena, setup, training):
    if training and "practiceDeck" in setup:
        arena.play([Action(-1), Action(-1)], OPENING_TICKS)
    return arena.state()["tick"]
