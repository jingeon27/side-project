"""Both seats act through their own observation; only native terminal results train.

Every game draws its setup: a deck matchup, each side's input delay and card level, and how far
the second side's decision clock runs behind the first. Each side decides every `decisionTicks`
on its own clock, as the live runtime does every capture while its opponent acts whenever.
Training games search the best of the policy's candidates; evaluation games play the policy
alone, as it is deployed: through its screen (`policy.screen`), which reads no tower hit points.
"""

import time

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, PositiveInt

from ..policy.features import action_features, context_features
from ..policy.noise import PerceptionNoise
from ..policy.samples import SparseFeatures, value_target
from ..policy.screen import Screen
from ..sim.engine import Arena
from ..sim.rules import DECKS, LIVE_DECK, SPEC, Action
from .search import Workspace, search
from .storage import seed_for


class SelfplaySpec(BaseModel):
    """contracts/arena.json selfplay."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    # Share of games that are the live deck's mirror; the rest pair pool decks so the network
    # learns what card attributes mean rather than one deck's cards.
    liveMirror: float = Field(ge=0, le=1)
    liveAgainstPool: float = Field(ge=0, le=1)
    decisionTicks: PositiveInt
    # The second side decides this many ticks after the first, drawn per game.
    decisionPhaseTicks: tuple[int, int]
    searchTicks: PositiveInt
    rootActions: int = Field(ge=2)
    negatives: int = Field(ge=0)
    commandDelayTicks: tuple[int, int]
    levelOffsets: tuple[int, ...] = Field(min_length=1)
    perception: PerceptionNoise


SELFPLAY = SelfplaySpec.model_validate(SPEC["selfplay"])


def live_setup(index=0):
    """The live game: the live deck's mirror at the measured input delay and the arena level.

    Games of a series differ by `index` only in how far apart the two decision clocks run.
    """
    delay = SPEC["liveCommandDelayTicks"]
    return {
        "decks": [LIVE_DECK, LIVE_DECK],
        "delays": [delay, delay],
        "levels": [SPEC["level"]] * 2,
        "phase": (7 * index) % SELFPLAY.decisionTicks,
    }


def setup_for(game_id):
    """A training game's matchup, input delays and card levels, drawn from its id."""
    rng = np.random.default_rng(seed_for("setup", game_id))
    if rng.random() < SELFPLAY.liveMirror:
        decks = [LIVE_DECK, LIVE_DECK]
    elif rng.random() < SELFPLAY.liveAgainstPool:
        threats = sorted(set(DECKS) - {LIVE_DECK})
        decks = [LIVE_DECK, threats[int(rng.integers(len(threats)))]]
        if rng.integers(2):
            decks.reverse()
    else:
        names = sorted(DECKS)
        decks = [names[int(rng.integers(len(names)))] for _ in range(2)]
    low, high = SELFPLAY.commandDelayTicks
    first, last = SELFPLAY.decisionPhaseTicks
    return {
        "decks": decks,
        "delays": [int(rng.integers(low, high + 1)) for _ in range(2)],
        "levels": [SPEC["level"] + int(rng.choice(SELFPLAY.levelOffsets)) for _ in range(2)],
        "phase": int(rng.integers(first, last + 1)),
    }


def live_mirror(game):
    """Only these games feed the Qwen studies: decision-v3 prompts know the live deck alone."""
    return game["setup"]["decks"] == [LIVE_DECK, LIVE_DECK]


def tower_damage(player):
    """Share of this side's total tower hit points destroyed by the end of the game."""
    hp = np.asarray(player["tower_hp"], np.float64)
    return float(np.mean(1 - hp / np.maximum(1, player["tower_max_hp"])))


def training_rows(observation, result, screen, rng):
    """The searched candidates and a few the search left out, read as the side's screen reads them.

    Unsearched candidates are negatives (target 0), so the policy also learns to keep the grid's
    poor placements below the searched ones it ranks for live play.
    """
    others = result["others"]
    picked = rng.choice(len(others), min(SELFPLAY.negatives, len(others)), replace=False)
    rows = [*result["actions"], *(others[int(index)] for index in sorted(picked))]
    context = screen.read(observation, rows)
    target = [*result["target"].tolist(), *[0.0] * len(picked)]
    return rows, context_features(context), action_features(context), target


def play_game(
    policies,
    game_id,
    rules_id,
    simulations=16,
    depth=5,
    training=True,
    max_ticks=6200,
    report=None,
    setup=None,
):
    """`simulations=0` plays each policy's best candidate without search, as deployed."""
    began = time.perf_counter()
    setup = setup or live_setup()
    arena = Arena(
        seed_for("environment", game_id),
        decks=setup["decks"],
        delays=setup["delays"],
        levels=setup["levels"],
    )
    workspace = Workspace(particles=2)
    # Each side's hidden-hand hypotheses, continued from one of its searches to the next.
    beliefs = [[None] * len(workspace.worlds) for _ in policies]
    choices = np.random.default_rng(seed_for("acting", game_id))
    negatives = np.random.default_rng(seed_for("negatives", game_id))
    screens = [
        Screen(SELFPLAY.perception, np.random.default_rng(seed_for("perception", game_id, team)))
        for team in (0, 1)
    ]
    # The tick of each side's next decision; the second clock runs `phase` ticks behind.
    due = [0, setup.get("phase", 0)]
    samples, rejected, decisions, searches = [], 0, 0, 0
    while not arena.state()["game_over"] and arena.state()["tick"] < max_ticks:
        state = arena.state()
        selected = [Action(-1), Action(-1)]
        for team, policy in enumerate(policies):
            if due[team] > state["tick"]:
                continue
            due[team] += SELFPLAY.decisionTicks
            observation = arena.observe(team)
            screens[team].watch(observation)
            candidates = [Action(*row) for row in observation["legalActions"]]
            if len(candidates) == 1:
                continue
            decisions += 1
            if simulations == 0:
                prior = policy.deployed(observation, candidates, screens[team])
                selected[team] = candidates[int(np.argmax(prior))]
                continue
            result = search(
                observation,
                policy,
                seed_for("search", game_id, state["tick"], team),
                simulations=simulations,
                depth=depth,
                step_ticks=SELFPLAY.searchTicks,
                first_ticks=SELFPLAY.decisionTicks,
                root_size=SELFPLAY.rootActions,
                noise=training,
                opponent_policy=policies[1 - team],
                workspace=workspace,
                beliefs=beliefs[team],
            )
            probabilities = result["target"].astype(np.float64)
            if training:
                temperature = 1 if state["tick"] < 1200 else 0.35
                probabilities = probabilities ** (1 / temperature)
                probabilities /= probabilities.sum()
                chosen = int(choices.choice(len(probabilities), p=probabilities))
            else:
                chosen = int(np.argmax(probabilities))
            selected[team] = result["actions"][chosen]
            searches += result["simulations"]
            if training:
                rows, state_features, action_vectors, target = training_rows(
                    observation, result, screens[team], negatives
                )
                samples.append(
                    {
                        "gameID": game_id,
                        "rulesID": rules_id,
                        "team": team,
                        "policyVersion": policy.metadata["version"],
                        # The candidate list is rebuilt by search; keep only the public state.
                        "observation": {
                            key: value
                            for key, value in observation.items()
                            if key != "legalActions"
                        },
                        "features": SparseFeatures.of(state_features).model_dump(),
                        "actions": [action.row() for action in rows],
                        "actionFeatures": action_vectors.tolist(),
                        "target": target,
                        "chosen": chosen,
                        "search": {
                            key: value
                            for key, value in result.items()
                            if key not in ("actions", "target", "others")
                        },
                        "outcome": None,
                    }
                )
        outcomes = arena.play(selected, min(due) - state["tick"])
        rejected += sum(row[1] != 0 for row in outcomes)
        if report and decisions % 20 == 0:
            report(
                {
                    "gameID": game_id,
                    "tick": arena.state()["tick"],
                    "decisions": decisions,
                    "searches": searches,
                }
            )
    state = arena.state()
    completed = bool(state["game_over"])
    damage = [tower_damage(player) for player in state["players"]]
    for sample in samples:
        sample["outcome"] = (
            (0 if state["winner"] == 2 else 1 if state["winner"] == sample["team"] else -1)
            if completed
            else None
        )
        sample["value"] = (
            value_target(sample["outcome"], damage[1 - sample["team"]] - damage[sample["team"]])
            if completed
            else None
        )
    return {
        "format": "clash-arena-selfplay-v2",
        "gameID": game_id,
        "rulesID": rules_id,
        "setup": setup,
        "policies": [
            {"version": policy.metadata["version"], "weightsSHA256": policy.checksum()}
            for policy in policies
        ],
        "completed": completed,
        "winner": state["winner"] if completed else None,
        "crowns": [player["crowns"] for player in state["players"]],
        "tick": state["tick"],
        "elapsedSeconds": time.perf_counter() - began,
        "rejectedCommands": rejected,
        "decisions": decisions,
        "searchSimulations": searches,
        "publicHistory": arena.history,
        "samples": samples if completed else [],
        "truncatedSamplesDiscarded": 0 if completed else len(samples),
    }


def replay_samples(episodes, rules_id, max_samples=4096, seed=0):
    valid = []
    for episode in episodes:
        if not episode["completed"]:
            continue
        if episode["rulesID"] != rules_id:
            continue  # A patch's dynamics/returns must not silently mix with this one.
        valid.extend(row for row in episode["samples"] if row["outcome"] in (-1, 0, 1))
    if len(valid) <= max_samples:
        return valid
    order = np.random.default_rng(seed).choice(len(valid), max_samples, replace=False)
    return [valid[index] for index in order]
