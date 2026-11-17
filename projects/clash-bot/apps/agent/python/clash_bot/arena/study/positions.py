"""Choose tactical BEFORE positions across card opportunities, games and time buckets."""

import random
from collections import Counter

from ..training.storage import seed_for


def balanced_positions(episodes, limit):
    """No winner, later frame, chosen move or teacher outcome enters this selection."""
    if not episodes or limit <= 0:
        return []
    rows = [
        {"gameID": game["gameID"], "sample": sample}
        for game in episodes
        for sample in game["samples"][::3]
    ]
    rng = random.Random(seed_for("tactical-positions", [game["gameID"] for game in episodes]))
    rng.shuffle(rows)
    cards = list(range(8))  # decision-v3 Qwen targets describe the live deck only.
    rng.shuffle(cards)
    used, games, stages, selected = set(), Counter(), Counter(), []

    def observation(row):
        return row["sample"]["observation"]

    def key(row):
        obs = observation(row)
        return row["gameID"], obs["team"], obs["state"]["tick"]

    def stage(row):
        return min(2, observation(row)["state"]["tick"] // 1200)

    def available(row, card):
        obs = observation(row)
        own = obs["state"]["players"][obs["team"]]
        return any(
            held == card and cost * 1000 <= own["elixir_milli"]
            for held, cost in zip(own["hand"], own["hand_costs"])
        )

    for _ in range(limit):
        added = False
        for card in cards:
            choices = [row for row in rows if key(row) not in used and available(row, card)]
            if not choices:
                continue
            row = min(choices, key=lambda row: (games[row["gameID"]], stages[stage(row)]))
            used.add(key(row))
            games[row["gameID"]] += 1
            stages[stage(row)] += 1
            selected.append({**row, "focusCard": card, "stage": stage(row)})
            added = True
            if len(selected) >= limit:
                return selected
        if not added:
            break
    return selected
