"""Construct a legal training opening for a card, charged evolution or ready ability."""

from functools import cache

import numpy as np

from clash_bot.card_specs import engine_specs

from ..sim.candidates import legal_actions, placements
from ..sim.rules import CARD_ID, CARDS, DECKS, OMIT_OPENING, TILE, Action, canonical, deck_ids
from .storage import seed_for

WAIT = Action(-1)
KINDS = ("card", "evolution", "hero", "champion")


@cache
def goal_decks():
    champions = {
        spec["engine"]
        for spec in engine_specs()["cards"].values()
        if spec["forms"].get("champion", {}).get("ability")
    }
    goals = {}
    for name, deck in DECKS.items():
        for card, form in zip(deck.cards, deck.forms, strict=True):
            kinds = ["card"]
            if form == 1:
                kinds.append("evolution")
            if form == 2:
                kinds.append("hero")
            if card in champions and form == 0:
                kinds.append("champion")
            for kind in kinds:
                goals.setdefault(f"{kind}:{card}", []).append(name)
    return goals


def focus_orders(setup, game_id):
    card = setup["focusGoal"].split(":")[1]
    rng = np.random.default_rng(seed_for("focus-draw", game_id))
    orders = []
    for deck in setup["decks"]:
        others = [c for c in rng.permutation(deck_ids(deck)).tolist() if c != CARD_ID[card]]
        # Cards excluded from a natural opening enter through the draw queue.
        available = [c for c in others if CARDS[c] not in OMIT_OPENING]
        rest = [c for c in others if CARDS[c] in OMIT_OPENING]
        order = available + rest
        order.insert(4 if card in OMIT_OPENING else 0, CARD_ID[card])
        orders.append(order)
    if setup["focusGoal"].split(":")[0] != "card":
        orders[1] = orders[0].copy()
    return orders


def ready(player, card, kind):
    if kind == "evolution":
        return any(row[0] == card and row[2] for row in player["evo"])
    if kind in ("hero", "champion"):
        return bool(
            player["abilities"] and player["abilities"][0][3] == card and player["abilities"][0][0]
        )
    return True


def prepare(arena, setup):
    """Charge and cycle using real commands, mana and time, on both seats."""
    kind, name = setup["focusGoal"].split(":")
    card, seat = CARD_ID[name], setup["focusSeat"]
    family = -2 if kind in ("hero", "champion") else card
    arena.play([WAIT, WAIT], 320)
    if kind == "card" and setup.get("focusContext", 0):
        state = arena.state()
        moves = [WAIT, WAIT]
        for team in (0, 1):
            if not setup["focusContext"] & (1 if team == seat else 2):
                continue
            player = state["players"][team]
            x = setup["focusLane"]
            _, y = canonical(x, 13, team)
            choices = [
                a
                for a in legal_actions(arena.battle, team, state)
                if a.card >= 0
                and a.card != card
                and placements()[a.card] in ("troop", "ranged_troop")
            ]
            moves[team] = min(
                choices,
                key=lambda a: (
                    player["hand_costs"][player["hand"].index(a.card)],
                    (a.x / TILE - x) ** 2 + (a.y / TILE - y) ** 2,
                ),
                default=WAIT,
            )
        arena.play(moves, 112)
    last_deploy = [-1000, -1000]
    while not arena.state()["game_over"] and arena.state()["tick"] < 3000:
        state = arena.state()
        moves = []
        for team, player in enumerate(state["players"]):
            actions = legal_actions(arena.battle, team, state)
            if (
                team == seat
                and ready(player, card, kind)
                and any(a.card == family for a in actions)
            ):
                return state["tick"]
            if (
                kind in ("hero", "champion")
                and state["tick"] - last_deploy[team] < 220
                or player["pending_cost"]
            ):
                moves.append(WAIT)
                continue
            by_card = {a.card for a in actions if a.card >= 0}
            if card in player["hand"]:
                wanted = card
            else:
                # Spend the cheapest legal filler to bring the focus card back through FIFO.
                wanted = min(
                    by_card,
                    key=lambda c: (player["hand_costs"][player["hand"].index(c)], c),
                    default=-1,
                )
            choices = [a for a in actions if a.card == wanted]
            x = setup["focusLane"]
            _, y = canonical(x, 8 if kind == "evolution" else 11, team)
            move = min(
                choices, key=lambda a: (a.x / TILE - x) ** 2 + (a.y / TILE - y) ** 2, default=WAIT
            )
            moves.append(move)
            if move.card == card:
                last_deploy[team] = state["tick"]
        arena.play(moves, 32)
    return arena.state()["tick"]
