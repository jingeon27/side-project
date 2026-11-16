"""Adapter to the pinned native battle core; no Counterpush internal state/API.

The native engine is used as a dependency, not copied or ported. Its code is MIT;
its underlying game tables have separate ownership (see THIRD_PARTY.md).
"""

import hashlib
import itertools
import json
import random
from dataclasses import dataclass
from fractions import Fraction

import royalesim

from clash_bot.paths import CONTRACTS_DIR

SPEC = json.loads((CONTRACTS_DIR / "arena.json").read_text())
CARDS = SPEC["cards"]
FORMS = SPEC["forms"]
TILE = 1000 * royalesim.SUBTILE_PER_MILLITILE
FIELDS = {name: index for index, name in enumerate(royalesim.ENTITY_FIELDS)}
EXPECTED_FIELDS = ["uid", "team", "kind", "card_id", "tower_slot", "x", "y", "hp", "max_hp"]
if list(royalesim.ENTITY_FIELDS[:9]) != EXPECTED_FIELDS:
    raise RuntimeError("Unrecognized native entity ABI")


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def new_battle():
    if royalesim.__version__ != SPEC["version"]:
        raise RuntimeError("Engine version differs from the pinned arena rules")
    return royalesim.Battle(
        card_names=CARDS,
        slot_of_k=[[0, 1, 2], [0, 1, 2]],
        level=SPEC["level"],
        tower_level=SPEC["level"],
        calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
    )


def rules_identity():
    battle = new_battle()
    data = royalesim.data_dir()
    identity = {
        "engine": SPEC["engine"],
        "engineVersion": royalesim.__version__,
        "commit": battle.provenance()[0],
        "table": battle.card_table(),
        "tableFNV": battle.card_table_fnv1a64(),
        # Current tables are compiled into the wheel. The source hash
        # is pinned from its verified sdist; FNV is the running table's.
        "tableSourceSHA256": SPEC["tableSHA256"],
        "wheelSHA256": SPEC["sha256"],
        "calibrationSHA256": hashlib.sha256((data / "calibration.json").read_bytes()).hexdigest(),
        "cards": CARDS,
        "forms": FORMS,
        "level": SPEC["level"],
    }
    if identity["tableFNV"] != SPEC["tableFNV"] or identity["commit"] != SPEC["commit"]:
        raise ValueError("Native rules/provenance mismatch")
    return {**identity, "id": digest(identity)}


@dataclass(frozen=True)
class Action:
    card: int  # -1 wait, -2 ability; otherwise index in CARDS, never a hidden hand slot
    x: int = 0
    y: int = 0

    def row(self):
        return [self.card, self.x, self.y]


def canonical(x, y, team):
    return (x, y) if team == 0 else (18 - x, 32 - y)


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


def command(battle, action, team, state=None):
    if action.card == -1:
        return None
    state = state or json.loads(battle.state_json())
    if action.card == -2:
        return (team, royalesim.HAND_SIZE, 0, 0)
    hand = state["players"][team]["hand"]
    if action.card not in hand:
        return None
    return (team, hand.index(action.card), action.x, action.y)


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


class Arena:
    def __init__(self, seed, initial_decks=None):
        self.battle = new_battle()
        self.catalogue = json.loads(self.battle.catalogue_json())
        self.reset(seed, initial_decks)

    def reset(self, seed, initial_decks=None):
        decks = initial_decks or [list(range(8)), list(range(8))]
        self.battle.reset(
            seed=seed,
            decks=decks,
            shuffle=0 if initial_decks else 1,
            start_tick=0,
            elixir_milli=[5000, 5000],
            tower_hp=None,
            spawns=[],
            forms=[[FORMS[card] for card in deck] for deck in decks],
        )
        initial = self.state()
        self.initial_hands = [player["hand"] for player in initial["players"]]
        self.initial_next = [player["next_card"] for player in initial["players"]]
        self.history = []

    def state(self):
        return json.loads(self.battle.state_json())

    def clone(self):
        copy = object.__new__(Arena)
        copy.battle = new_battle()
        copy.battle.load(self.battle.save())
        copy.catalogue = self.catalogue
        copy.initial_hands = [hand.copy() for hand in self.initial_hands]
        copy.initial_next = self.initial_next.copy()
        copy.history = self.history.copy()
        return copy

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
        # handed to a policy or search. Each observer gets its own opening only.
        observation = {
            "team": team,
            "state": state,
            "history": self.history.copy(),
            "initial_hand": self.initial_hands[team].copy(),
            "initial_next": self.initial_next[team],
        }
        if include_legal:
            observation["legalActions"] = [
                action.row() for action in legal_actions(self.battle, team)
            ]
        return observation

    def play(self, actions, ticks=40):
        before = self.state()
        commands, proposed = [], []
        for team, action in enumerate(actions):
            cmd = command(self.battle, action, team, before)
            if cmd is not None:
                commands.append(cmd)
                proposed.append((team, action))
        results = self.battle.step(commands, ticks)
        accepted = []
        for (team, action), result in zip(proposed, results):
            if result[1] != 0:
                continue
            cost = (
                before["players"][team]["abilities"][0][2]
                if action.card == -2
                else self.catalogue[action.card][2]
            )
            accepted.append({"team": team, "action": action.row(), "cost": cost})
        if accepted:
            self.history.append({"tick": before["tick"], "plays": accepted})
        return results


def legal_actions(battle, team, state=None):
    state = state or json.loads(battle.state_json())
    player = state["players"][team]
    actions = [Action(-1)]
    units = [
        dict(zip(royalesim.ENTITY_FIELDS, row))
        for row in state["entities"]
        if row[FIELDS["card_id"]] >= 0
    ]
    invaders = [
        unit
        for unit in units
        if unit["team"] != team and canonical(unit["x"] / TILE, unit["y"] / TILE, team)[1] < 16
    ]
    nearest = min(
        invaders,
        key=lambda unit: canonical(unit["x"] / TILE, unit["y"] / TILE, team)[1],
        default=None,
    )
    threat = canonical(nearest["x"] / TILE, nearest["y"] / TILE, team) if nearest else None
    for card in player["hand"]:
        if card < 0:
            continue
        if card == 3:  # Graveyard: centre / outer / forward in both lanes
            points = [
                (x + dx, y)
                for x in (3.5, 14.5)
                for dx, y in ((0, 25.5), (-0.8 if x < 9 else 0.8, 25), (0, 24.5))
            ]
        elif card == 6:
            targets = [
                canonical(unit["x"] / TILE, unit["y"] / TILE, team)
                for unit in units
                if unit["team"] != team
            ]
            points = ([threat] if threat else []) + targets[:3] + [(3.5, 25.5), (14.5, 25.5)]
        elif card == 2:
            points = [(9, 9), (7, 12), (11, 12), (3.5, 10), (14.5, 10), (9, 6)]
        else:
            points = [(6, 3.5), (12, 3.5), (3.5, 10), (14.5, 10), (3.5, 14), (14.5, 14)]
            if threat:
                x, y = threat
                gap = 3 if card in (1, 4) else 1
                points[:2] = [
                    (max(0.6, min(17.4, x)), max(1, min(15, y - gap))),
                    (9, max(2, min(13, y - 1))),
                ]
        for x, y in points[:6]:
            x, y = canonical(x, y, team)
            action = Action(card, round(x * TILE), round(y * TILE))
            cmd = (team, player["hand"].index(card), action.x, action.y)
            if cmd and battle.check_deploy(*cmd) == 0 and action not in actions:
                actions.append(action)
    ability = Action(-2)
    if battle.check_deploy(team, royalesim.HAND_SIZE, 0, 0) == 0:
        actions.append(ability)
    if player["elixir_milli"] >= 8000 and len(actions) > 1:
        actions.remove(Action(-1))
    return actions


def compatible_openings(observation, actor):
    own = actor == observation["team"]
    plays = [
        play["action"][0]
        for event in observation["history"]
        for play in event["plays"]
        if play["team"] == actor and play["action"][0] >= 0
    ]
    hands = [tuple(observation["initial_hand"])] if own else itertools.combinations(range(8), 4)
    current = observation["state"]["players"][actor] if own else None
    compatible = []
    for hand in hands:
        for queue in itertools.permutations(card for card in range(8) if card not in hand):
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
        decks = [self.rng.choice(rows) for rows in self.openings]
        seed = self.rng.getrandbits(32)
        arena = into or Arena(seed, decks)
        if into:
            arena.reset(seed, decks)
        for event in self.observation["history"]:
            gap = event["tick"] - arena.state()["tick"]
            if gap > 0:
                arena.play([Action(-1), Action(-1)], gap)
            actions = [Action(-1), Action(-1)]
            for play in event["plays"]:
                actions[play["team"]] = Action(*play["action"])
            # One tick is enough to consume a public simultaneous command.
            arena.play(actions, 1)
        gap = self.observation["state"]["tick"] - arena.state()["tick"]
        if gap > 0:
            arena.play([Action(-1), Action(-1)], gap)
        return arena
