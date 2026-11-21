"""Separate the acting policy, the search teacher and deliberate training trials."""

from ..policy.choice import card_choice, grouped_indices, sample_card
from ..sim.rules import CARD_ID


def choose(actions, target, rng, tick, training, deployed, exploration):
    if deployed is not None:
        return deployed, actions.index(deployed) if deployed in actions else None
    families = [a.card for a in actions]
    if not training:
        index = card_choice(families, target)
    else:
        temperature = 1 if tick < 1200 else 0.35
        if rng.random() < exploration:
            groups = [g for g in grouped_indices(families) if sum(target[i] for i in g) > 0]
            group = groups[int(rng.integers(len(groups)))]
            local = sample_card(
                [families[i] for i in group], [target[i] for i in group], rng, temperature
            )
            index = group[local]
        else:
            index = sample_card(families, target, rng, temperature)
    return actions[index], index


def trial_due(history, tick, context, actions, baseline):
    if "graveyard" not in context["hand"]:
        return False
    funded = any(a.card == CARD_ID["Graveyard"] for a in actions)
    if not funded and (context["elixir"] < 3 or actions[baseline].card == -1):
        return False
    supported = funded and any(
        b["kind"] in ("knight", "furnace") and b["y"] >= 17 for b in context["bodies"]["own"]
    )
    key = (funded, supported)
    previous = history.get(key, [])
    if len(previous) >= (1 if funded else 2) or (previous and tick - previous[-1] < 180):
        return False
    history.setdefault(key, []).append(tick)
    return True


def pool_trial_due(history, tick, player, actions, baseline, card):
    if card not in player["hand"]:
        return False
    funded = any(action.card == card for action in actions)
    if not funded and (
        player["pending_cost"]
        or actions[baseline].card == -1
        or player["hand_costs"][player["hand"].index(card)] * 1000 <= player["elixir_milli"]
    ):
        return False
    key = ("pool", funded)
    attempts = history.setdefault(key, [])
    if len(attempts) >= 2 or (attempts and tick - attempts[-1] < 240):
        return False
    attempts.append(tick)
    return True
