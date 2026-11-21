"""Regular deck coverage through legal opening positions and frozen-policy games."""

from functools import cache
from itertools import zip_longest

import numpy as np

from ..catalogue import current
from ..sim.rules import (
    CARD_ID,
    DECKS,
    LIVE_DECK,
    OMIT_OPENING,
    PRACTICE_DECKS,
    TILE,
    Action,
    canonical,
    deck_ids,
)
from .storage import seed_for

# Both players wait through their normal elixir recharge. Even the most expensive pool card
# can then enter the searched candidates when drawn in the opening four.
OPENING_TICKS = 224


@cache
def rotation():
    lookup = current()

    def by_cost(names):
        return sorted(
            names, key=lambda n: (-lookup.card(lookup.card_name(DECKS[n].cards[0])).elixir, n)
        )

    forms = {n for n, d in PRACTICE_DECKS.items() if any(d.forms)}
    groups = (
        by_cost(forms),
        by_cost(PRACTICE_DECKS.keys() - forms),
        by_cost(DECKS.keys() - PRACTICE_DECKS.keys() - {LIVE_DECK}),
    )
    return [name for batch in zip_longest(*groups) for name in batch if name is not None]


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
    if setup.get("offenseOpening", {}).get("knight"):
        index = orders[seat].index(CARD_ID["Knight"])
        if index >= 4:
            orders[seat][3], orders[seat][index] = orders[seat][index], orders[seat][3]
    return orders


def open_practice(arena, setup, training):
    if training and "practiceDeck" in setup:
        arena.play([Action(-1), Action(-1)], OPENING_TICKS)
        opening = setup.get("offenseOpening")
        if opening and opening["knight"]:
            seat = opening["seat"]
            x, y = canonical(14.5 if opening["right"] else 3.5, 8, seat)
            knight = Action(CARD_ID["Knight"], round(x * TILE), round(y * TILE))
            moves = [Action(-1), Action(-1)]
            moves[seat] = knight
            arena.play(moves, 200)
            if not any(
                play["team"] == seat and play["action"] == knight.row()
                for event in arena.history
                for play in event["plays"]
            ):
                raise ValueError("Offensive practice needs the Knight's native execution receipt")
    return arena.state()["tick"]
