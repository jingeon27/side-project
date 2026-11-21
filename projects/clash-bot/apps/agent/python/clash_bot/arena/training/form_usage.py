"""Count native form executions in the completed training game, outside the search observations."""

from collections import Counter

from ..sim.rules import CARDS


def form_counts():
    return {key: Counter() for key in ("evolvedDeployments", "heroDeployments", "abilityUses")}


def opening_receipt(before, after, events, actor, tick):
    for event in events:
        if event["tick"] != tick:
            continue
        for play in event["plays"]:
            if play["team"] == actor:
                forms = form_counts()
                count_form_plays(forms, before, after, [{"plays": [play]}], {actor})
                return {"tick": tick, "action": play["action"], "forms": forms}
    return None


def count_form_plays(counts, before, after, events, policy_seats):
    for event in events:
        for play in event["plays"]:
            team, card = play["team"], play["action"][0]
            if team not in policy_seats:
                continue
            player, next_player = before["players"][team], after["players"][team]
            if card == -2:
                abilities = player["abilities"] or next_player["abilities"]
                if abilities:
                    counts["abilityUses"][CARDS[abilities[0][3]]] += 1
                continue
            if dict(zip(player["deck"], player["forms"])).get(card) == 2:
                counts["heroDeployments"][CARDS[card]] += 1
            charged = any(row[0] == card and row[2] for row in player["evo"])
            if charged and any(row[0] == card and row[1:3] == [0, 0] for row in next_player["evo"]):
                counts["evolvedDeployments"][CARDS[card]] += 1
