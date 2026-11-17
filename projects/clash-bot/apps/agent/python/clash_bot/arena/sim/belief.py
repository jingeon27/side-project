"""Infer hidden decks/draws from public plays; the configured pool is a finite prior, not an oracle."""

import itertools
import random
from functools import lru_cache

from .engine import Arena, public_board
from .rules import DECKS, OBSERVATION_FORMAT, Action, deck_ids


@lru_cache(maxsize=512)
def draw_orders(deck, plays, opening, first, current, next_card):
    hands = [opening] if opening is not None else itertools.combinations(deck, 4)
    compatible = []
    for hand in hands:
        for queue in itertools.permutations(card for card in deck if card not in hand):
            if opening is not None and queue[0] != first:
                continue
            h, q = list(hand), list(queue)
            for card in plays:
                if card not in h:
                    break
                index = h.index(card)
                h[index], q = q[0], q[1:] + [card]
            else:
                if current is None or (tuple(h) == current and q[0] == next_card):
                    compatible.append(tuple(hand) + tuple(queue))
    return tuple(compatible)


def public_cards(observation, actor):
    return tuple(
        play["action"][0]
        for event in observation["history"]
        for play in event["plays"]
        if play["team"] == actor and play["action"][0] >= 0
    )


def compatible_openings(observation, actor, deck_name):
    own = actor == observation["team"]
    current = observation["state"]["players"][actor] if own else None
    return draw_orders(
        tuple(deck_ids(deck_name)),
        public_cards(observation, actor),
        tuple(observation["initial_hand"]) if own else None,
        observation["initial_next"] if own else None,
        tuple(current["hand"]) if own else None,
        current["next_card"] if own else None,
    )


class BeliefSampler:
    """Sample public-compatible deck/draw hypotheses and replay their public commands."""

    def __init__(self, observation, seed):
        team = observation["team"]
        if (
            observation["format"] != OBSERVATION_FORMAT
            or observation["decks"][1 - team] is not None
        ):
            raise ValueError("The current observation must hide the opponent deck")
        self.observation = observation
        self.rng = random.Random(seed)
        self.openings = []
        for actor in (0, 1):
            seen = set(public_cards(observation, actor))
            names = (
                [observation["decks"][actor]]
                if actor == team
                else [name for name in sorted(DECKS) if seen <= set(deck_ids(name))]
            )
            pool = {
                name: orders
                for name in names
                if (orders := compatible_openings(observation, actor, name))
            }
            if not pool:
                raise ValueError("Public plays/hand contradict every deck in the configured prior")
            self.openings.append(pool)
        self.deck_order = [self.rng.sample(list(pool), len(pool)) for pool in self.openings]
        self.samples = 0

    def conditioned(self, into=None):
        """Try every candidate deck before repeating one, and match visible combat/forms."""
        visible = public_board(self.observation["state"])
        limit = max(16, 2 * max(map(len, self.openings)))
        for attempt in range(1, limit + 1):
            world = self.sample(into)
            if public_board(world.state()) == visible:
                return world, attempt
        raise ValueError("Public history hypotheses cannot reproduce the visible board")

    def sample(self, into=None):
        observation = self.observation
        names = [order[self.samples % len(order)] for order in self.deck_order]
        self.samples += 1
        orders = [list(self.rng.choice(pool[name])) for pool, name in zip(self.openings, names)]
        seed = self.rng.getrandbits(32)
        setup = (names, observation["delays"], observation["levels"])
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
