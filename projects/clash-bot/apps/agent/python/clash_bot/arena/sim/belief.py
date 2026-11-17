"""Infer hidden decks/draws from public plays; the configured pool is a finite prior, not an oracle."""

import itertools
import random
from dataclasses import dataclass
from functools import lru_cache

from .conditioning import position_error
from .engine import Arena, Record, public_board
from .rules import DECKS, OBSERVATION_FORMAT, TILE, Action, deck_ids


class PublicRootMismatch(ValueError):
    """The public combat facts cannot be reproduced within the requested position bound."""


@dataclass
class Particle:
    """One sampled hypothesis kept between an observer's decisions of the same game.

    `saved` is its world at `frontier`: the battle save and the public record. Every input
    accepted before the frontier was already known to the observer, so a later decision
    continues from there instead of replaying the game from its first tick.
    """

    names: list
    orders: list
    seed: int
    frontier: int
    saved: tuple


@lru_cache(maxsize=512)
def draw_orders(deck, timeline, opening, first, current, next_card):
    hands = [opening] if opening is not None else itertools.combinations(deck, 4)
    compatible = []
    for hand in hands:
        for queue in itertools.permutations(card for card in deck if card not in hand):
            if opening is not None and queue[0] != first:
                continue
            h, q = list(hand), list(queue)
            pending = set()
            for _tick, phase, card in timeline:
                if card not in h or (phase == 0 and card in pending):
                    break
                if phase == 0:
                    pending.add(card)
                else:
                    index = h.index(card)
                    h[index], q = q[0], q[1:] + [card]
                    pending.remove(card)
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
    # A confirmed card had to be IN HAND when the input was accepted, not merely
    # when its delayed play ran. At a tick boundary inputs precede that tick's draws.
    timeline = sorted(
        entry
        for event in observation["history"]
        for play in event["plays"]
        if play["team"] == actor and play["action"][0] >= 0
        for entry in (
            (event["tick"] - observation["delays"][actor], 0, play["action"][0]),
            (event["tick"], 1, play["action"][0]),
        )
    )
    timeline += [
        (play["tick"] - observation["delays"][actor], 0, play["action"][0])
        for play in observation["pending"]
        if play["team"] == actor and play["action"][0] >= 0
    ]
    return draw_orders(
        tuple(deck_ids(deck_name)),
        tuple(sorted(timeline)),
        tuple(observation["initial_hand"]) if own else None,
        observation["initial_next"] if own else None,
        tuple(current["hand"]) if own else None,
        current["next_card"] if own else None,
    )


class BeliefSampler:
    """Sample public-compatible deck/draw hypotheses and replay their public commands.

    With `keep`, each sampled world is also saved at the frontier, for `resume` at the
    observer's next decision.
    """

    def __init__(self, observation, seed, keep=False):
        team = observation["team"]
        if (
            observation["format"] != OBSERVATION_FORMAT
            or observation["decks"][1 - team] is not None
        ):
            raise ValueError("The current observation must hide the opponent deck")
        self.observation = observation
        self.keep = keep
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
        self.last_board = None
        self.conditioning = None
        self.sampled = None
        delays = observation["delays"]
        # Every public play, and the observer's own accepted plays, by the tick each was
        # accepted on: its side's delay before it ran, so the replay runs them on the same
        # ticks as the observed game.
        self.commands = sorted(
            [
                (event["tick"] - delays[play["team"]], play["team"], play["action"])
                for event in observation["history"]
                for play in event["plays"]
            ]
            + [
                (play["tick"] - delays[play["team"]], play["team"], play["action"])
                for play in observation["pending"]
            ]
        )
        self.now = observation["state"]["tick"]
        # An opponent input accepted before this tick has run and is public by now.
        self.frontier = max(0, self.now - delays[1 - team])

    def matches(self, arena, position_tolerance_tiles):
        self.last_board = public_board(arena.state())
        error = position_error(
            public_board(self.observation["state"]),
            self.last_board,
            position_tolerance_tiles * TILE,
        )
        self.conditioning = (
            None
            if error is None
            else {
                "mode": "exact" if error == 0 else "position_bounded",
                "maxPositionErrorTiles": error / TILE,
                "positionToleranceTiles": position_tolerance_tiles,
            }
        )
        return error is not None

    def conditioned(self, into=None, position_tolerance_tiles=0):
        """Try every candidate deck before repeating one, and match visible combat/forms."""
        limit = max(16, 2 * max(map(len, self.openings)))
        for attempt in range(1, limit + 1):
            world = self.sample(into)
            if self.matches(world, position_tolerance_tiles):
                return world, attempt
        raise PublicRootMismatch("Public history hypotheses cannot reproduce the visible board")

    def sample(self, into=None):
        names = [order[self.samples % len(order)] for order in self.deck_order]
        self.samples += 1
        orders = [list(self.rng.choice(pool[name])) for pool, name in zip(self.openings, names)]
        return self.world(names, orders, self.rng.getrandbits(32), into)

    def world(self, names, orders, seed, into=None):
        """The hypothesis replayed from the first tick; `sampled` is how to continue it."""
        setup = (names, self.observation["delays"], self.observation["levels"])
        arena = into or Arena(seed, orders, *setup)
        if into:
            arena.reset(seed, orders, *setup)
        self.sampled = Particle(names, orders, seed, self.frontier, None)
        if self.keep:
            self.replay(arena, self.frontier)
            self.sampled.saved = (arena.battle.save(), Record(arena))
        self.replay(arena, self.now)
        return arena

    def replay(self, arena, upto):
        """Run the arena to `upto`, issuing each known command on the tick it was accepted."""
        start = arena.state()["tick"]
        due = [command for command in self.commands if start <= command[0] < upto]
        for tick, group in itertools.groupby(due, key=lambda command: command[0]):
            gap = tick - arena.state()["tick"]
            if gap > 0:
                arena.play([Action(-1), Action(-1)], gap)
            actions = [Action(-1), Action(-1)]
            for _, team, row in group:
                actions[team] = Action(*row)
            # One tick is enough to accept a public simultaneous command.
            arena.play(actions, 1)
        gap = upto - arena.state()["tick"]
        if gap > 0:
            arena.play([Action(-1), Action(-1)], gap)

    def resume(self, particle, into, position_tolerance_tiles=0):
        """Continue a kept hypothesis to now, or None when it no longer fits what is public.

        It must still be one of the compatible draw orders and reproduce the visible board:
        a hypothesis that ran one of our plays the real game dropped fails the board check.
        """
        observation = self.observation
        record = particle.saved[1]
        if (
            particle.frontier > self.frontier
            or record.delays != observation["delays"]
            or record.levels != observation["levels"]
            or any(
                tuple(order) not in pool.get(name, ())
                for pool, name, order in zip(self.openings, particle.names, particle.orders)
            )
        ):
            return None
        arena = into.adopt(*particle.saved)
        self.replay(arena, self.frontier)
        saved = (arena.battle.save(), Record(arena))
        self.replay(arena, self.now)
        if not self.matches(arena, position_tolerance_tiles):
            return None
        particle.frontier, particle.saved = self.frontier, saved
        return arena
