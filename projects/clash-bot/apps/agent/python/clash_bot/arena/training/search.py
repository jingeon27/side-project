"""Information-set PUCT against frozen policy responses and sampled hidden draws.

Root worlds come from PUBLIC play history, never the real engine's save/RNG/hand.
Only our choices are optimized; the opponent follows its saved card/placement policy.
A visible-material heuristic bootstraps the value head; this is not pure AlphaZero.
"""

import time
from functools import partial

import numpy as np

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR

from ..sim.belief import BeliefSampler, PublicRootMismatch
from ..sim.candidates import legal_actions
from ..sim.clock import DECISION_TICKS, PLANNING_TICKS, advance_window, opponent_offsets
from ..sim.engine import Arena
from ..sim.rules import CARDS, ROLLOUT_CLOCK, SPEC, Action, command, digest, rules_identity
from .attack_comparison import compare
from .bandits import Node, exploration_prior, pick, retain_reference, root_priors, root_subset
from .defense_rollout import comparisons
from .improvement import improved_policy
from .public_value import estimate
from .rollout import frozen_move, rollout_choices


def terminal(state, team):
    if not state["game_over"]:
        return None
    return 0.0 if state["winner"] == 2 else 1.0 if state["winner"] == team else -1.0


class Workspace:
    def __init__(self, particles=2):
        self.worlds = [Arena(index) for index in range(particles)]
        self.scratch = self.worlds[0].clone()


def reconstruct(sampler, workspace, particles, beliefs=None):
    """Worlds that replay the public history onto the visible board; failures keep their evidence.

    `beliefs` holds this observer's hypotheses from its previous decision of the same game. One
    that still fits continues from its save; otherwise a new one is sampled and kept in its place.
    """
    worlds, attempts, continued, conditioning = [], 0, 0, []
    tolerance = SPEC["selfplay"]["rootPositionToleranceTiles"]
    for index in range(particles):
        world = None
        if beliefs is not None and beliefs[index] is not None:
            world = sampler.resume(
                beliefs[index], into=workspace.worlds[index], position_tolerance_tiles=tolerance
            )
        if world is not None:
            continued += 1
            worlds.append(world)
            conditioning.append(sampler.conditioning)
            continue
        try:
            world, count = sampler.conditioned(
                into=workspace.worlds[index], position_tolerance_tiles=tolerance
            )
        except PublicRootMismatch as error:
            observation = sampler.observation
            path = DATA_DIR / "arena/reconstruction-failures" / f"{digest(observation)}.json"
            atomic_json(
                path,
                {
                    "format": "clash-public-root-failure-v1",
                    "rulesID": rules_identity()["id"],
                    "cards": CARDS,
                    "observation": observation,
                    "deckHypotheses": [list(pool) for pool in sampler.openings],
                    "lastReconstructedBoard": sampler.last_board,
                },
            )
            raise PublicRootMismatch(
                f"Public root reconstruction failed; evidence: {path}"
            ) from error
        attempts += count
        worlds.append(world)
        conditioning.append(sampler.conditioning)
        if beliefs is not None:
            beliefs[index] = sampler.sampled
    return worlds, attempts, continued, conditioning


def first_ply(world, team, root_actions, root_prior, leaf_weights):
    """One sampled world's root choices, shared by every simulation that starts from it.

    Returns (value, None) when there are no choices, otherwise (None, (actions, priors)).
    """
    state = world.state()
    value = terminal(state, team)
    if value is not None:
        return value, None
    own_actions = [
        action
        for action in root_actions
        if action.card == -1
        or (
            (cmd := command(world.battle, action, team, state)) is not None
            and world.battle.check_deploy(*cmd) == 0
        )
    ]
    if not own_actions:
        return estimate(world.observe(team, include_legal=False), leaf_weights), None
    priors = np.array([root_prior[root_actions.index(action)] for action in own_actions])
    priors /= priors.sum()
    return None, (own_actions, priors)


def leaf_value(world, team, policy, leaf_weights):
    own = world.observe(team, include_legal=False)
    value = terminal(own["state"], team)
    if value is not None:
        return value
    _, network_value = policy.predict(own, legal_actions(world.battle, team, world.state()))
    return 0.25 * network_value + 0.75 * estimate(own, leaf_weights)


def search(
    observation,
    policy,
    seed,
    simulations=32,
    depth=5,
    particles=2,
    noise=False,
    max_ms=None,
    opponent_policy=None,
    workspace=None,
    root_size=16,
    beliefs=None,
    observed_prior=None,
    focus=(),
    defense=None,
    leaf_weights=None,
    reference_action=None,
    attack_baseline=None,
    pool_card=None,
):
    """Search the best `root_size` of the observation's candidates.

    The first window lasts one decision interval, later windows span the configured planning
    interval. Both sides can respond at their native ticks between planned moves.
    `beliefs` is a list of `particles` slots, None at first, that one observer of one game passes
    to each of its searches so hidden-hand hypotheses continue between them.
    """
    began = time.perf_counter()
    rng = np.random.default_rng(seed)
    sampler = BeliefSampler(observation, seed, keep=beliefs is not None)
    workspace = workspace or Workspace(particles)
    worlds, attempts, continued, conditioning = reconstruct(sampler, workspace, particles, beliefs)
    team = observation["team"]
    enemy_move = partial(frozen_move, policy=opponent_policy or policy, rng=rng)
    own_move = partial(frozen_move, policy=policy, rng=rng)
    offsets, phase_source = opponent_offsets(observation, rng, len(worlds))
    root_tick = observation["state"]["tick"]
    root = Node()
    candidates = [Action(*row) for row in observation["legalActions"]]
    prior = observed_prior
    if prior is None:
        prior, _ = policy.predict(observation, candidates)
    prior = np.asarray(prior, np.float64)
    if (
        prior.shape != (len(candidates),)
        or not np.isfinite(prior).all()
        or np.any(prior < 0)
        or prior.sum() <= 0
    ):
        raise ValueError("Root observation prior must cover every legal candidate")
    prior = prior / prior.sum()
    # Spend at least half of a normal budget on revisits, rather than one uniform visit per tile.
    keep = root_subset(
        candidates, prior, rng, min(root_size, max(2, simulations // 2)), noise, focus
    )
    keep = retain_reference(candidates, prior, keep, reference_action)
    root_actions = [candidates[index] for index in keep]
    root_prior = root_priors(candidates, prior, keep)
    learning_prior = root_prior.copy()
    if noise and len(root_actions) > 1:
        root_prior = exploration_prior(root_actions, root_prior, rng)
    snapshots = [world.battle.save() for world in worlds]
    world = workspace.scratch
    roots = {}
    reached, elapsed_ticks = 0, 0
    for simulation in range(simulations):
        if max_ms is not None and simulation and (time.perf_counter() - began) * 1000 >= max_ms:
            break
        index = simulation % len(worlds)
        world.adopt(snapshots[index], worlds[index])
        if index not in roots:
            roots[index] = first_ply(world, team, root_actions, root_prior, leaf_weights)
        node, path = root, []
        for ply in range(depth):
            if ply == 0:
                value, choices = roots[index]
                if choices is None:
                    break
                own_actions, priors = choices
            else:
                value = terminal(world.state(), team)
                if value is not None:
                    break
                own_actions, priors = rollout_choices(world, team, policy, rng)
            ours = pick(node.own, own_actions, priors, rng, 1.5, cover=ply == 0)
            path.append((node, ours))
            branch = advance_window(
                world,
                team,
                ours,
                DECISION_TICKS if ply == 0 else PLANNING_TICKS,
                offsets[index],
                enemy_move,
                own_move,
            )
            reached = max(reached, ply + 1)
            node = node.children.setdefault(branch, Node())
        else:
            value = leaf_value(world, team, policy, leaf_weights)
        elapsed_ticks = max(elapsed_ticks, world.state()["tick"] - root_tick)
        for visited, ours in reversed(path):
            visited.visits += 1
            visited.own[ours]["n"] += 1
            visited.own[ours]["w"] += value
    visits = np.array([root.own.get(action, {}).get("n", 0) for action in root_actions], np.float32)
    values = np.array(
        [
            root.own.get(action, {}).get("w", 0) / max(1, root.own.get(action, {}).get("n", 0))
            for action in root_actions
        ]
    )
    exact = all(row["mode"] == "exact" for row in conditioning)
    defense_comparison = (
        comparisons(world, worlds, snapshots, team, candidates, prior, defense)
        if defense is not None and exact and len(worlds) >= 2
        else None
    )
    attack_comparison = None
    if attack_baseline is not None and exact and len(worlds) >= 2:
        policies = [opponent_policy or policy] * 2
        policies[team] = policy
        attack_comparison = compare(
            world,
            worlds,
            snapshots,
            offsets,
            candidates,
            attack_baseline,
            team,
            policies,
            seed,
            pool_card,
            prior,
        )
    return {
        "actions": root_actions,
        **improved_policy(learning_prior, values, visits),
        "prior": learning_prior.tolist(),
        "visits": visits.tolist(),
        "values": values.tolist(),
        "leafModel": "validated_public_outcome" if leaf_weights is not None else "tower_baseline",
        "simulations": int(visits.sum()),
        "elapsedMs": (time.perf_counter() - began) * 1000,
        "beliefHypotheses": [sum(map(len, pool.values())) for pool in sampler.openings],
        "deckHypotheses": [len(pool) for pool in sampler.openings],
        "maxDepth": reached,
        "depthLimit": depth,
        "maxLookaheadSeconds": elapsed_ticks / 20,
        "rootCandidates": len(candidates),
        "rootConditioningAttempts": attempts,
        "continuedHypotheses": continued,
        "reconstruction": "public_board_exact" if exact else "public_board_position_bounded",
        "rootConditioning": conditioning,
        "source": "public_history_information_set_puct",
        "rootPriorSource": "matched_screen_without_towers"
        if observed_prior is not None
        else "exact_public_without_towers",
        "rolloutPrior": "anchors_and_uniform_residual_importance_v1",
        "opponentResponse": "frozen_card_policy",
        "responseTiming": ROLLOUT_CLOCK,
        "opponentPhaseSource": phase_source,
        "opponentOffsetsTicks": offsets,
        "focusedFamilies": list(focus),
        "defenseComparison": defense_comparison,
        "attackComparison": attack_comparison,
    }
