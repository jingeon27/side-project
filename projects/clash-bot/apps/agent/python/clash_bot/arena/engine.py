"""One simulated game: delayed plays, the public record and what each side may observe.

No Counterpush internal state or API is used. A play runs, and becomes public, its side's
input delay after it was accepted; until then only its own side knows it.
"""

import itertools
import json
from fractions import Fraction

from .candidates import dense_actions
from .rules import FIELDS, LIVE_DECK, SPEC, command, deck_ids, forms_of, new_battle


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


def public_mana(history, tick, team):
    """Reconstruct from public clock and confirmed costs; overflow is discarded.

    50ms ticks, 2.8s/elixir, 2x from 120s and 3x after 240s are pinned native rules.
    Fractions avoid a drifting reconstruction; tests compare with native balances.
    """
    mana, previous = Fraction(5000), 0

    def gain(start, end):
        edges = sorted({start, end, *[edge for edge in (2400, 4800) if start < edge < end]})
        return sum(
            Fraction((b - a) * 50000 * (1 if a < 2400 else 2 if a < 4800 else 3), 2800)
            for a, b in zip(edges, edges[1:])
        )

    for event in history:
        if event["tick"] > tick:
            break
        mana = min(Fraction(10000), mana + gain(previous, event["tick"]))
        previous = event["tick"]
        for play in event["plays"]:
            if play["team"] == team:
                mana -= play["cost"] * 1000
    return float(min(Fraction(10000), mana + gain(previous, tick))) / 1000


# Recent public positions kept for unit motion: one snapshot per step, the last few seconds.
TRAIL = 6


class Arena:
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

    def reset(self, seed, initial_decks=None, decks=None, delays=None, levels=None):
        """`decks` names each side's pool deck and `initial_decks` an exact draw order of it.

        `delays` is each side's input delay in ticks (the live client measured 21-22); a play
        runs and becomes visible that long after it was accepted. `levels` is each side's card
        level. All three are the public setup of the game, as unit level badges are.
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
        initial = self.state()
        self.initial_hands = [player["hand"] for player in initial["players"]]
        self.initial_next = [player["next_card"] for player in initial["players"]]
        self.history = []
        # Accepted plays that have not run yet: {"tick": public tick, "team", "action", "cost"}.
        self.pending = []
        self.trail = []

    def state(self):
        return json.loads(self.battle.state_json())

    def adopt(self, snapshot, source):
        """Load a saved battle with the public bookkeeping of the arena it came from."""
        self.battle.load(snapshot)
        self.decks, self.delays, self.levels = source.decks, source.delays, source.levels
        self.initial_hands, self.initial_next = source.initial_hands, source.initial_next
        self.history = source.history.copy()
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
        estimate = public_mana(self.history, state["tick"], 1 - team)
        state["players"][1 - team] = {
            "team": 1 - team,
            "elixir_range": [max(0, estimate - 0.05), min(10, estimate + 0.05)],
            "crowns": enemy["crowns"],
            "tower_hp": enemy["tower_hp"],
            "tower_max_hp": enemy["tower_max_hp"],
            "king_active": enemy["king_active"],
        }
        # Target ids, tunnel destinations and exact private ability timers are
        # not policy inputs. The network uses only visible unit fields below.
        for row in state["entities"]:
            for field in ("target_uid", "dest_x", "dest_y", "ability_ticks"):
                row[FIELDS[field]] = -1 if field != "ability_ticks" else 0
        # These are public plays. No enemy hand/queue, future RNG or save blob is
        # handed to a policy or search. Each observer gets its own opening and its own
        # accepted plays that have not run yet; the opponent's stay hidden until they run.
        # Decks, delays and levels are the public setup, as in the Counterpush mirror match.
        observation = {
            "team": team,
            "state": state,
            "decks": self.decks.copy(),
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
                action.row() for action in dense_actions(self.battle, team)
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
        due = sorted(
            (play for play in self.pending if play["tick"] < after["tick"]),
            key=lambda play: (play["tick"], play["team"]),
        )
        self.pending = [play for play in self.pending if play["tick"] >= after["tick"]]
        for tick, group in itertools.groupby(due, key=lambda play: play["tick"]):
            # A delayed card that no longer fits is dropped by the engine and stays in hand.
            plays = [
                {key: play[key] for key in ("team", "action", "cost")}
                for play in group
                if play["action"][0] < 0
                or play["action"][0] not in after["players"][play["team"]]["hand"]
            ]
            if plays:
                self.history.append({"tick": tick, "plays": plays})
        return results
