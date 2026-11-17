"""A fixed yardstick: the policy as deployed against rule bots that never learn.

The champion gate only says a candidate beats the previous champion. Results against bots that
never change show whether the line of champions gets stronger at all. Games run in live
conditions: the live deck's mirror, the measured input delay, and no search.
"""

import hashlib
import math

import numpy as np

from ..sim.rules import DEPLOYMENT, FIELDS, TILE, canonical
from .selfplay import live_setup, play_game
from .storage import seed_for


class ScriptedPolicy:
    """A rule bot with the policy interface: all probability on its own choice."""

    def __init__(self, name, choose, seed):
        self.name = name
        self.choose = choose
        self.rng = np.random.default_rng(seed)
        self.metadata = {"version": -1, "scripted": name}

    def predict(self, observation, actions):
        probabilities = np.zeros(len(actions))
        probabilities[self.choose(observation, actions, self.rng)] = 1
        return probabilities, 0.0

    def checksum(self):
        return hashlib.sha256(self.name.encode()).hexdigest()


def tiles(observation, actions):
    return [canonical(action.x / TILE, action.y / TILE, observation["team"]) for action in actions]


def deepest_invader(observation):
    """The enemy unit furthest into our half, in our frame, or None."""
    team = observation["team"]
    points = [
        canonical(row[FIELDS["x"]] / TILE, row[FIELDS["y"]] / TILE, team)
        for row in observation["state"]["entities"]
        if row[FIELDS["card_id"]] >= 0 and row[FIELDS["team"]] != team
    ]
    return min((point for point in points if point[1] < 16), key=lambda p: p[1], default=None)


def random_bot(observation, actions, rng):
    """Waits half the time, otherwise plays a uniformly random candidate."""
    return 0 if rng.random() < 0.5 else int(rng.integers(len(actions)))


def defender_bot(observation, actions, rng):
    """Answers the deepest invader with the nearest placement; else saves up and builds behind."""
    player = observation["state"]["players"][observation["team"]]
    cost = dict(zip(player["hand"], player["hand_costs"]))
    places = tiles(observation, actions)
    cards = [index for index, action in enumerate(actions) if action.card >= 0]
    threat = deepest_invader(observation)
    if threat and cards:
        return min(
            cards,
            key=lambda index: (math.dist(places[index], threat), cost[actions[index].card]),
        )
    if player["elixir_milli"] >= 9500 and cards:
        back = [
            index
            for index in cards
            if any(math.dist(places[index], tile) < 0.6 for tile in DEPLOYMENT.kingBackTiles)
        ]
        return min(back or cards, key=lambda index: cost[actions[index].card])
    return 0


BOTS = {"random": random_bot, "defender": defender_bot}


def wilson(successes, games, z=1.96):
    """95% Wilson interval of a score; a draw counts as half a win."""
    if games == 0:
        return [0.0, 1.0]
    rate = successes / games
    centre = (rate + z * z / (2 * games)) / (1 + z * z / games)
    spread = z * math.sqrt(rate * (1 - rate) / games + z * z / (4 * games * games))
    return [
        max(0.0, centre - spread / (1 + z * z / games)),
        min(1.0, centre + spread / (1 + z * z / games)),
    ]


def benchmark(policy, rules_id, pairs=8, report=None):
    opponents = {}
    for name, choose in BOTS.items():
        tally, margins = {"wins": 0, "draws": 0, "losses": 0}, []
        for pair in range(pairs):
            for seat in (0, 1):
                bot = ScriptedPolicy(name, choose, seed_for("benchmark-bot", name, pair, seat))
                models = [bot, bot]
                models[seat] = policy
                # The same world seed for both seats of a pair.
                game = play_game(
                    models,
                    f"benchmark-{name}-{pair}",
                    rules_id,
                    simulations=0,
                    training=False,
                    setup=live_setup(),
                )
                if not game["completed"] or game["rejectedCommands"]:
                    raise ValueError("Unverified or invalid-action benchmark game")
                result = (
                    "draws"
                    if game["winner"] == 2
                    else "wins"
                    if game["winner"] == seat
                    else "losses"
                )
                tally[result] += 1
                margins.append(game["crowns"][seat] - game["crowns"][1 - seat])
                if report:
                    report(
                        {"phase": "benchmarking", "opponent": name, "pair": pair + 1, "seat": seat}
                    )
        games = 2 * pairs
        points = tally["wins"] + tally["draws"] / 2
        opponents[name] = {
            "games": games,
            **tally,
            "score": points / games,
            "interval": wilson(points, games),
            "crownMargin": float(np.mean(margins)),
        }
    return {
        "format": "clash-arena-benchmark-v1",
        "rulesID": rules_id,
        "policy": {"version": policy.metadata["version"], "weightsSHA256": policy.checksum()},
        "setup": live_setup(),
        "opponents": opponents,
    }
