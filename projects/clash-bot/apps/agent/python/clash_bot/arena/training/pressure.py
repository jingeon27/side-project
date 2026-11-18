"""A training opponent that creates actual attacks with legal deck and elixir rules."""

from functools import partial

import numpy as np

from ..sim.rules import CARD_ID, LIVE_DECK, TILE, canonical, deck_ids
from .benchmark import ScriptedPolicy, defender_bot
from .storage import seed_for

ATTACKS = {
    "graveyard": (LIVE_DECK, "Graveyard", (3.5, 25.5)),
    "graveyard_poison": (LIVE_DECK, "Graveyard", (2.5, 25.5)),
    "drill": ("drill_control", "GoblinDrill", (3.5, 25.5)),
    "firecracker": ("hog_firecracker", "Firecracker", (3.5, 14.0)),
    "bait": ("bait", "GoblinBarrel", (3.5, 25.5)),
}


def schedule_pressure(setup, index, seat, right):
    name = list(ATTACKS)[index % len(ATTACKS)]
    deck, _card, _point = ATTACKS[name]
    decks = [LIVE_DECK, LIVE_DECK]
    decks[1 - seat] = deck
    return {**setup, "decks": decks, "pressure": name, "pressureRight": right}


def opening_orders(setup, seat, game_id):
    """The attacker starts with the intended card, shuffled after its reserved opening."""
    rng = np.random.default_rng(seed_for("pressure_opening", game_id))
    orders = [rng.permutation(deck_ids(deck)).tolist() for deck in setup["decks"]]
    name = setup["pressure"]
    first = [CARD_ID[ATTACKS[name][1]]]
    if name == "graveyard_poison":
        first.append(CARD_ID["Poison"])
    enemy = 1 - seat
    orders[enemy] = first + [card for card in orders[enemy] if card not in first]
    return orders


def choose_attack(observation, actions, rng, name, right):
    _deck, card, (x, y) = ATTACKS[name]
    team = observation["team"]
    if right:
        x = 18 - x
    attack = CARD_ID[card]
    state = observation["state"]
    if name == "graveyard_poison":
        # A different slot can accept an input before the Graveyard executes. Bank
        # our elixir during that gap so a filler card cannot consume the Poison budget.
        if any(play["action"][0] == attack for play in observation["pending"]):
            return 0
        own_grave = next(
            (
                play["action"]
                for event in reversed(observation["history"])
                if 0 <= state["tick"] - event["tick"] < 120
                for play in event["plays"]
                if play["team"] == team and play["action"][0] == attack
            ),
            None,
        )
        if own_grave is not None:
            attack = CARD_ID["Poison"]
            x, y = canonical(own_grave[1] / TILE, own_grave[2] / TILE, team)
    choices = [i for i, action in enumerate(actions) if action.card == attack]
    mana = state["players"][team]["elixir_milli"]
    # Preserve elixir for the combo while the attacker holds its first Graveyard.
    if choices and name == "graveyard_poison" and attack == CARD_ID["Graveyard"] and mana < 9000:
        return 0
    if not choices:
        return defender_bot(observation, actions, rng)
    tx, ty = canonical(x, y, team)
    return min(
        choices, key=lambda i: (actions[i].x / TILE - tx) ** 2 + (actions[i].y / TILE - ty) ** 2
    )


def pressure_policy(setup, game_id):
    name = setup["pressure"]
    right = setup["pressureRight"]
    return ScriptedPolicy(
        f"pressure:{name}:{'right' if right else 'left'}",
        partial(choose_attack, name=name, right=right),
        seed_for("pressure_policy", game_id),
    )
