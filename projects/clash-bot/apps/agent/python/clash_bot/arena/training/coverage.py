"""Before-position coverage and executed plays, separated by card and opponent exercise."""

from collections import Counter

from ..sim.rules import CARD_ID, CARDS, LIVE_DECK
from .pressure import ATTACKS


def card_coverage(episodes):
    names = [name for name in CARDS if CARD_ID[name] < 8] + ["ability"]
    rows = {name: {"compared": 0, "multiplePlacements": 0, "executed": 0} for name in names}
    exercises, attacks = Counter(), Counter()
    for game in episodes:
        decks = game["setup"]["decks"]
        profile = game["setup"].get("pressure")
        if profile is not None:
            exercises[profile] += 1
        for sample in game["samples"]:
            if decks[sample["team"]] != LIVE_DECK:
                continue
            for card, count in Counter(action[0] for action in sample["actions"]).items():
                if card == -1:
                    continue
                name = "ability" if card == -2 else CARDS[card]
                rows[name]["compared"] += 1
                rows[name]["multiplePlacements"] += int(count > 1)
        for event in game["publicHistory"]:
            for play in event["plays"]:
                card, team = play["action"][0], play["team"]
                scripted = game["policies"][team].get("scripted")
                if decks[team] == LIVE_DECK and not scripted:
                    rows["ability" if card == -2 else CARDS[card]]["executed"] += 1
                if profile is not None and scripted:
                    if card == CARD_ID[ATTACKS[profile][1]]:
                        attacks[profile] += 1
                    if profile == "graveyard_poison" and card == CARD_ID["Poison"]:
                        attacks["graveyard_poison_followup"] += 1
    return {"cards": rows, "practiceGames": dict(exercises), "executedAttacks": dict(attacks)}
