"""One simulated game: delayed plays, the public record and what each side may observe.

No Counterpush internal state or API is used. A play runs, and becomes public, its side's
input delay after it was accepted; until then only its own side knows it.
"""

import itertools
import json

from .candidates import dense_actions
from .elixir import ElixirLedger
from .rules import (
    FIELDS,
    LIVE_DECK,
    OBSERVATION_FORMAT,
    SPEC,
    command,
    deck_ids,
    forms_of,
    new_battle,
)


def public_board(state):
    """Condition hidden hypotheses on visible combat, not just card history."""
    fields = [
        FIELDS[key]
        for key in ("team", "kind", "card_id", "tower_slot", "x", "y", "hp", "max_hp", "unit_type")
    ]
    return {
        "units": sorted(tuple(row[index] for index in fields) for row in state["entities"]),
        "spells": sorted(tuple(row[:5]) for row in state["spells"]),
        "towers": [
            (player["tower_hp"], player["crowns"], player["king_active"])
            for player in state["players"]
        ],
    }


# Recent public positions kept for unit motion: one snapshot per step, the last few seconds.
TRAIL = 6
# Target ids, tunnel destinations and exact private ability timers are not policy inputs.
HIDDEN = [
    (FIELDS[name], value)
    for name, value in (("target_uid", -1), ("dest_x", -1), ("dest_y", -1), ("ability_ticks", 0))
]


def visible(row):
    row = row.copy()
    for index, value in HIDDEN:
        row[index] = value
    return row


class Record:
    """An arena's public bookkeeping at one moment; with a battle save, enough to `adopt` later."""

    def __init__(self, arena):
        self.decks, self.delays, self.levels = arena.decks, arena.delays, arena.levels
        self.initial_hands, self.initial_next = arena.initial_hands, arena.initial_next
        self.history = arena.history.copy()
        self.ledgers = [ledger.copy() for ledger in arena.ledgers]
        self.pending = [play.copy() for play in arena.pending]
        self.trail = arena.trail.copy()


class Arena:
    """The native battle with its public record.

    `state()` is parsed once per step and shared by every reader until the next one, so nothing
    may change it in place; an observation is built as new containers around it.
    """

    def __init__(self, seed, initial_decks=None, decks=None, delays=(0, 0), levels=None):
        self.battle = new_battle()
        self.catalogue = json.loads(self.battle.catalogue_json())
        self.reset(
            seed,
            initial_decks,
            decks or [LIVE_DECK, LIVE_DECK],
            delays,
            levels or [SPEC["level"], SPEC["level"]],
        )

    @property
    def battle(self):
        return self._battle

    @battle.setter
    def battle(self, battle):
        self._battle = battle
        self.changed()

    def changed(self):
        """The native battle moved: drop what was read from it."""
        self._state = self._entities = None

    def reset(self, seed, initial_decks=None, decks=None, delays=None, levels=None):
        """`decks` names each side's pool deck and `initial_decks` an exact draw order of it.

        `delays` is each side's input delay in ticks (the live client measured 21-22); a play
        runs and becomes visible that long after it was accepted. `levels` is each side's card
        level. Only the observer's deck is public; the other list is never sent to it.
        """
        self.decks = list(decks or self.decks)
        self.delays = list(delays or self.delays)
        self.levels = list(levels or self.levels)
        orders = initial_decks or [deck_ids(name) for name in self.decks]
        for name, order in zip(self.decks, orders):
            if sorted(order) != sorted(deck_ids(name)):
                raise ValueError(f"A draw order must hold exactly the {name} deck's cards")
        self.battle.set_command_delay_ticks(*self.delays)
        self.battle.reset(
            seed=seed,
            decks=orders,
            shuffle=0 if initial_decks else 1,
            start_tick=0,
            elixir_milli=[5000, 5000],
            tower_hp=None,
            spawns=[],
            forms=[forms_of(name, order) for name, order in zip(self.decks, orders)],
            levels=[[level] * len(order) for level, order in zip(self.levels, orders)],
        )
        self.changed()
        initial = self.state()
        self.initial_hands = [player["hand"] for player in initial["players"]]
        self.initial_next = [player["next_card"] for player in initial["players"]]
        self.history = []
        self.ledgers = [ElixirLedger(), ElixirLedger()]
        # Accepted plays that have not run yet: {"tick": public tick, "team", "action", "cost"}.
        self.pending = []
        self.trail = []

    def state(self):
        if self._state is None:
            self._state = json.loads(self.battle.state_json())
        return self._state

    def adopt(self, snapshot, source):
        """Load a saved battle with the public bookkeeping of the arena or record it came from."""
        self.battle.load(snapshot)
        self.changed()
        self.decks, self.delays, self.levels = source.decks, source.delays, source.levels
        self.initial_hands, self.initial_next = source.initial_hands, source.initial_next
        self.history = source.history.copy()
        self.ledgers = [ledger.copy() for ledger in source.ledgers]
        self.pending = [play.copy() for play in source.pending]
        self.trail = source.trail.copy()
        return self

    def clone(self):
        copy = object.__new__(Arena)
        copy.battle = new_battle()
        copy.catalogue = self.catalogue
        return copy.adopt(self.battle.save(), self)

    def observe(self, team, include_legal=True):
        state = self.state()
        enemy = state["players"][1 - team]
        estimate = self.ledgers[1 - team].at(state["tick"])
        players = list(state["players"])
        players[1 - team] = {
            "team": 1 - team,
            "elixir_range": [max(0, estimate - 0.05), min(10, estimate + 0.05)],
            "crowns": enemy["crowns"],
            "tower_hp": enemy["tower_hp"],
            "tower_max_hp": enemy["tower_max_hp"],
            "king_active": enemy["king_active"],
        }
        # The network uses only visible unit fields; both observers share these rows.
        if self._entities is None:
            self._entities = [visible(row) for row in state["entities"]]
        # These are public plays. No enemy hand/queue, future RNG or save blob is
        # handed to a policy or search. Each observer gets its own opening and its own
        # accepted plays that have not run yet; the opponent's stay hidden until they run.
        # The opponent deck is inferred from public plays, never read from the match setup.
        observation = {
            "format": OBSERVATION_FORMAT,
            "team": team,
            "state": {**state, "players": players, "entities": self._entities},
            "decks": [name if actor == team else None for actor, name in enumerate(self.decks)],
            "delays": self.delays.copy(),
            "levels": self.levels.copy(),
            "history": self.history.copy(),
            "pending": [play.copy() for play in self.pending if play["team"] == team],
            "trail": self.trail.copy(),
            "initial_hand": self.initial_hands[team].copy(),
            "initial_next": self.initial_next[team],
        }
        if include_legal:
            observation["legalActions"] = [
                action.row() for action in dense_actions(self.battle, team, state)
            ]
        return observation

    def play(self, actions, ticks=40):
        before = self.state()
        self.trail = [
            *self.trail[-(TRAIL - 1) :],
            [
                before["tick"],
                [
                    [row[FIELDS[key]] for key in ("uid", "x", "y")]
                    for row in before["entities"]
                    if row[FIELDS["card_id"]] >= 0
                ],
            ],
        ]
        commands, proposed = [], []
        for team, action in enumerate(actions):
            cmd = command(self.battle, action, team, before)
            if cmd is not None:
                commands.append(cmd)
                proposed.append((team, action))
        results = self.battle.step(commands, ticks)
        self.changed()
        for (team, action), result in zip(proposed, results):
            if result[1] != 0:
                continue
            cost = (
                before["players"][team]["abilities"][0][2]
                if action.card == -2
                else self.catalogue[action.card][2]
            )
            # A play runs, and is seen, the side's delay after the tick it was accepted on.
            self.pending.append(
                {
                    "tick": result[2] + self.delays[team],
                    "team": team,
                    "action": action.row(),
                    "cost": cost,
                }
            )
        after = self.state()
        # Accepted is not executed: a hero can die or a placement can stop fitting while
        # the command waits. Charge only the native execution receipt, not a hand heuristic.
        # One pending card/button per side is enforced by the native core. A terminal
        # drop is receipted at GAME_OVER, which can be EARLIER than its planned tick.
        receipts = {
            (team, kind, what): (tick, reason)
            for tick, team, kind, what, reason in self.battle.step_commands_run()
        }

        def receipt_key(play):
            card = play["action"][0]
            return play["team"], "ability" if card == -2 else "deploy", 4 if card == -2 else card

        def executed(play):
            if self.delays[play["team"]] == 0:
                return True  # Immediate accepted commands already executed in step's result.
            tick, reason = receipts[receipt_key(play)]
            if reason == 0 and tick != play["tick"]:
                raise ValueError("Native command executed on an unexpected tick")
            return reason == 0

        def finished(play):
            return play["tick"] < after["tick"] or receipt_key(play) in receipts

        due = sorted(
            (play for play in self.pending if finished(play)),
            key=lambda play: (play["tick"], play["team"]),
        )
        self.pending = [play for play in self.pending if not finished(play)]
        for tick, group in itertools.groupby(due, key=lambda play: play["tick"]):
            plays = [
                {key: play[key] for key in ("team", "action", "cost")}
                for play in group
                if executed(play)
            ]
            if plays:
                self.history.append({"tick": tick, "plays": plays})
                for play in plays:
                    self.ledgers[play["team"]].spend(tick, play["cost"])
        return results
