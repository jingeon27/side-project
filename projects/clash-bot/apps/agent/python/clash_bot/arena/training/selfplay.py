"""Both seats act through their own observation; only native terminal results train.

Every game draws its setup: a deck matchup, each side's input delay and card level, and how far
the second side's decision clock runs behind the first. Each side decides every `decisionTicks`
on its own clock, as the live runtime does every capture while its opponent acts whenever.
Training games search the best of the policy's candidates; evaluation games play the policy
alone, as it is deployed: through its screen (`policy.screen`), which reads no tower hit points.
"""

import time
from collections import Counter

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, PositiveInt

from ..policy.choice import card_choice
from ..policy.noise import PerceptionNoise
from ..policy.screen import Screen
from ..sim.belief import PublicRootMismatch
from ..sim.engine import Arena
from ..sim.rules import LIVE_DECK, MATCHUP_DECKS, SPEC, Action
from ..sim.status_effects import control_observations
from .collection import choose, trial_due
from .deck_practice import open_practice
from .defense_rollout import focus_families, observed_attack
from .form_usage import count_form_plays, form_counts, opening_receipt
from .public_value import examples
from .search import Workspace, search
from .storage import seed_for
from .targets import seal_outcomes, terminal_values, training_rows


class SelfplaySpec(BaseModel):
    """contracts/arena.json selfplay."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    # Share of games that are the live deck's mirror; the rest pair pool decks so the network
    # learns what card attributes mean rather than one deck's cards.
    liveMirror: float = Field(ge=0, le=1)
    liveAgainstPool: float = Field(ge=0, le=1)
    pressureEvery: int = Field(ge=2)
    familyExploration: float = Field(ge=0, le=1)
    decisionTicks: PositiveInt
    # The second side decides this many ticks after the first, drawn per game.
    decisionPhaseTicks: tuple[int, int]
    searchTicks: PositiveInt
    rootActions: int = Field(ge=2)
    rootPositionToleranceTiles: float = Field(ge=0, le=0.5)
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
        threats = sorted(set(MATCHUP_DECKS) - {LIVE_DECK})
        decks = [LIVE_DECK, threats[int(rng.integers(len(threats)))]]
        if rng.integers(2):
            decks.reverse()
    else:
        names = sorted(MATCHUP_DECKS)
        decks = [names[int(rng.integers(len(names)))] for _ in range(2)]
    low, high = SELFPLAY.commandDelayTicks
    first, last = SELFPLAY.decisionPhaseTicks
    return {
        "decks": decks,
        "delays": [int(rng.integers(low, high + 1)) for _ in range(2)],
        "levels": [SPEC["level"] + int(rng.choice(SELFPLAY.levelOffsets)) for _ in range(2)],
        "phase": int(rng.integers(first, last + 1)),
    }


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
    initial_orders=None,
    collector=None,
    leaf_weights=None,
    label_reference=None,
):
    """`simulations=0` plays each policy's best candidate without search, as deployed."""
    began = time.perf_counter()
    if collector is not None and (not training or not simulations):
        raise ValueError("A learner may collect positions only in searched training games")
    actors = list(policies)
    if collector is not None:
        actors[collector[0]] = collector[1]
    setup = setup or live_setup()
    arena = Arena(
        seed_for("environment", game_id),
        initial_decks=initial_orders,
        decks=setup["decks"],
        delays=setup["delays"],
        levels=setup["levels"],
    )
    workspace = Workspace(particles=2)
    # Each side's hidden-hand hypotheses, continued from one of its searches to the next.
    beliefs = [[None] * len(workspace.worlds) for _ in policies]
    choices = np.random.default_rng(seed_for("acting", game_id))
    screens = [
        Screen(SELFPLAY.perception, np.random.default_rng(seed_for("perception", game_id, team)))
        for team in (0, 1)
    ]
    # The tick of each side's next decision; the second clock runs `phase` ticks behind.
    opening_tick = open_practice(arena, setup, training)
    due = [opening_tick, opening_tick + setup.get("phase", 0)]
    samples, rejected, decisions, searches = [], 0, 0, 0
    forms = form_counts()
    first_receipt = None
    controls = Counter()
    policy_seats = {
        seat for seat, policy in enumerate(policies) if not policy.metadata.get("scripted")
    }
    unavailable, policy_only = [None, None], [0, 0]
    trials = [{}, {}]
    while not arena.state()["game_over"] and arena.state()["tick"] < max_ticks:
        state = arena.state()
        if training:
            controls.update(control_observations(state["entities"]))
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
            if (
                simulations == 0
                or "scripted" in policy.metadata
                or (collector is not None and team != collector[0])
            ):
                prior = policy.deployed(observation, candidates, screens[team])
                selected[team] = candidates[card_choice([a.card for a in candidates], prior)]
                continue
            result = None
            context = screens[team].read(observation, candidates)
            attack = observed_attack(context)
            masked = {key: value for key, value in context.items() if key != "towers"}
            observed_prior = policy.read(masked)[0]
            reference = label_reference or actors[team]
            prior = observed_prior if reference is policy else reference.read(masked)[0]
            best = card_choice([a.card for a in candidates], prior)
            deployed = candidates[best] if collector is not None else None
            if unavailable[team] is None:
                try:
                    result = search(
                        observation,
                        policy,
                        seed_for("search", game_id, state["tick"], team),
                        simulations=simulations,
                        depth=depth,
                        root_size=SELFPLAY.rootActions,
                        noise=training,
                        opponent_policy=policies[1 - team],
                        workspace=workspace,
                        beliefs=beliefs[team],
                        observed_prior=observed_prior,
                        focus=focus_families(context, attack),
                        defense=attack if training else None,
                        leaf_weights=leaf_weights,
                        reference_action=candidates[best],
                        attack_baseline=best
                        if (collector is not None or setup.get("offensePractice"))
                        and trial_due(trials[team], state["tick"], context, candidates, best)
                        else None,
                    )
                except PublicRootMismatch as error:
                    unavailable[team] = {"tick": state["tick"], "evidence": str(error)}
            if result is None:
                # The real native game remains authoritative. Finish with this seat's
                # frozen screen policy, but invent no expert targets for these decisions.
                policy_only[team] += 1
                selected[team] = (
                    deployed
                    or candidates[card_choice([a.card for a in candidates], observed_prior)]
                )
                continue
            selected[team], chosen = choose(
                result["actions"],
                result["target"],
                choices,
                state["tick"],
                training,
                deployed,
                SELFPLAY.familyExploration,
            )
            searches += result["simulations"]
            if training:
                samples.append(
                    {
                        "gameID": game_id,
                        "rulesID": rules_id,
                        "team": team,
                        "policyVersion": actors[team].metadata["version"],
                        "teacherVersion": policy.metadata["version"],
                        "referenceVersion": reference.metadata["version"],
                        "behavior": "deployed_learner"
                        if deployed is not None
                        else "searched_teacher",
                        "behaviorAction": selected[team].row(),
                        **training_rows(
                            observation, result, screens[team], chosen, reference, context=context
                        ),
                        "outcome": None,
                    }
                )
        history_size = len(arena.history)
        outcomes = arena.play(selected, min(due) - state["tick"])
        if training and len(arena.history) > history_size:
            events = arena.history[history_size:]
            count_form_plays(forms, state, arena.state(), events, policy_seats)
            if "focusGoal" in setup and first_receipt is None:
                actor = setup["focusSeat"]
                first_receipt = opening_receipt(
                    state, arena.state(), events, actor, opening_tick + arena.delays[actor]
                )
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
    seal_outcomes(samples, state)
    return {
        "format": "clash-arena-selfplay-v2",
        "gameID": game_id,
        "rulesID": rules_id,
        "setup": setup,
        "policies": [
            {
                "version": policy.metadata["version"],
                "weightsSHA256": policy.checksum(),
                **(
                    {"scripted": policy.metadata["scripted"]}
                    if "scripted" in policy.metadata
                    else {}
                ),
            }
            for policy in actors
        ],
        "completed": completed,
        "winner": state["winner"] if completed else None,
        "crowns": [player["crowns"] for player in state["players"]],
        "tick": state["tick"],
        "elapsedSeconds": time.perf_counter() - began,
        "rejectedCommands": rejected,
        "decisions": decisions,
        "searchSimulations": searches,
        "searchUnavailable": unavailable,
        "policyOnlyDecisions": policy_only,
        "publicHistory": arena.history,
        **(
            {
                "firstReceipt": first_receipt,
                "terminalValues": terminal_values(state) if completed else None,
            }
            if "focusGoal" in setup
            else {}
        ),
        **(
            {
                "trainingStartTick": opening_tick,
                "formExecutions": forms,
                "controlUnitFrames": dict(controls),
                "leafExamples": examples(samples) if completed else [],
            }
            if training
            else {}
        ),
        "samples": samples if completed else [],
        "truncatedSamplesDiscarded": 0 if completed else len(samples),
    }
