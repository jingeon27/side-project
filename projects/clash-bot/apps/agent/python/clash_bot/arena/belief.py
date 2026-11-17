"""Hidden hands rebuilt from public plays only, never from the real engine's hand or RNG."""

import itertools
import random

from .engine import Arena
from .rules import Action, deck_ids


def compatible_openings(observation, actor):
    own = actor == observation["team"]
    deck = deck_ids(observation["decks"][actor])
    plays = [
        play["action"][0]
        for event in observation["history"]
        for play in event["plays"]
        if play["team"] == actor and play["action"][0] >= 0
    ]
    hands = [tuple(observation["initial_hand"])] if own else itertools.combinations(deck, 4)
    current = observation["state"]["players"][actor] if own else None
    compatible = []
    for hand in hands:
        for queue in itertools.permutations(card for card in deck if card not in hand):
            if own and queue[0] != observation["initial_next"]:
                continue
            h, q = list(hand), list(queue)
            for card in plays:
                if card not in h:
                    break
                index = h.index(card)
                h[index], q = q[0], q[1:] + [card]
            else:
                if not own or (h == current["hand"] and q[0] == current["next_card"]):
                    compatible.append(list(hand) + list(queue))
    if not compatible:
        raise ValueError(
            "Public play history contradicts the observed hand; refuse hidden-state guessing"
        )
    return compatible


class BeliefSampler:
    """Replay sampled hidden openings, rather than cloning the true hidden hand."""

    def __init__(self, observation, seed):
        self.observation = observation
        self.rng = random.Random(seed)
        self.openings = [compatible_openings(observation, team) for team in (0, 1)]

    def sample(self, into=None):
        observation = self.observation
        orders = [self.rng.choice(rows) for rows in self.openings]
        seed = self.rng.getrandbits(32)
        setup = (observation["decks"], observation["delays"], observation["levels"])
        arena = into or Arena(seed, orders, *setup)
        if into:
            arena.reset(seed, orders, *setup)
        # Issue every public play, and the observer's own accepted plays, their delay before
        # they ran, so the replay runs them on the same ticks as the observed game.
        plays = [
            (event["tick"] - observation["delays"][play["team"]], play["team"], play["action"])
            for event in observation["history"]
            for play in event["plays"]
        ] + [
            (play["tick"] - observation["delays"][play["team"]], play["team"], play["action"])
            for play in observation["pending"]
        ]
        for tick, group in itertools.groupby(sorted(plays), key=lambda play: play[0]):
            gap = tick - arena.state()["tick"]
            if gap > 0:
                arena.play([Action(-1), Action(-1)], gap)
            actions = [Action(-1), Action(-1)]
            for _, team, row in group:
                actions[team] = Action(*row)
            # One tick is enough to accept a public simultaneous command.
            arena.play(actions, 1)
        gap = observation["state"]["tick"] - arena.state()["tick"]
        if gap > 0:
            arena.play([Action(-1), Action(-1)], gap)
        return arena
