"""Information-set PUCT with simultaneous responses and sampled hidden draws.

Root worlds come from PUBLIC play history, never the real engine's save/RNG/hand.
The two action bandits use opposite values. A bounded visible-material heuristic
bootstraps an untrained value head; this is not claimed to be pure AlphaZero.
"""

import time

import numpy as np

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR

from ..sim.belief import BeliefSampler, PublicRootMismatch
from ..sim.candidates import legal_actions
from ..sim.engine import Arena
from ..sim.rules import CARDS, SPEC, Action, command, digest, rules_identity
from .bandits import Node, exploration_prior, pick, root_priors, root_subset


def terminal(state, team):
    if not state["game_over"]:
        return None
    return 0.0 if state["winner"] == 2 else 1.0 if state["winner"] == team else -1.0


def position_value(observation):
    state, team = observation["state"], observation["team"]
    own, enemy = state["players"][team], state["players"][1 - team]
    hp = lambda player: (
        sum(h / max(1, m) for h, m in zip(player["tower_hp"], player["tower_max_hp"])) / 3
    )
    return float(np.tanh((hp(own) - hp(enemy)) * 2 + (own["crowns"] - enemy["crowns"]) * 0.6))


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


def first_ply(world, team, root_actions, root_prior, opponent):
    """One sampled world's root choices, shared by every simulation that starts from it.

    Like `later_ply`, returns (value, None) when the position is decided or leaves nothing to
    play, else (None, (own actions, their priors, enemy actions, their priors)).
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
        return position_value(world.observe(team, include_legal=False)), None
    priors = np.array([root_prior[root_actions.index(action)] for action in own_actions])
    priors /= priors.sum()
    enemy_actions = legal_actions(world.battle, 1 - team, state)
    enemy_priors, _ = opponent.predict(world.observe(1 - team, include_legal=False), enemy_actions)
    return None, (own_actions, priors, enemy_actions, enemy_priors)


def later_ply(world, team, policy, opponent):
    state = world.state()
    value = terminal(state, team)
    if value is not None:
        return value, None
    own_actions = legal_actions(world.battle, team, state)
    enemy_actions = legal_actions(world.battle, 1 - team, state)
    priors, _ = policy.predict(world.observe(team, include_legal=False), own_actions)
    # Complete a bounded rollout even through new nodes. With 26 simultaneous choices per
    # side, stopping at the first new joint child would otherwise evaluate almost every move
    # only 2s ahead.
    enemy_priors, _ = opponent.predict(world.observe(1 - team, include_legal=False), enemy_actions)
    return None, (own_actions, priors, enemy_actions, enemy_priors)


def leaf_value(world, team, policy):
    own = world.observe(team, include_legal=False)
    value = terminal(own["state"], team)
    if value is not None:
        return value
    _, estimate = policy.predict(own, legal_actions(world.battle, team, world.state()))
    return 0.75 * estimate + 0.25 * position_value(own)


def search(
    observation,
    policy,
    seed,
    simulations=32,
    depth=5,
    step_ticks=40,
    particles=2,
    noise=False,
    max_ms=None,
    opponent_policy=None,
    workspace=None,
    first_ticks=None,
    root_size=16,
    beliefs=None,
):
    """Search the best `root_size` of the observation's candidates.

    The first ply lasts `first_ticks` (the decision interval), later plies `step_ticks`.
    `beliefs` is a list of `particles` slots, None at first, that one observer of one game passes
    to each of its searches so hidden-hand hypotheses continue between them.
    """
    began = time.perf_counter()
    rng = np.random.default_rng(seed)
    sampler = BeliefSampler(observation, seed, keep=beliefs is not None)
    workspace = workspace or Workspace(particles)
    worlds, attempts, continued, conditioning = reconstruct(sampler, workspace, particles, beliefs)
    team = observation["team"]
    opponent = opponent_policy or policy
    root = Node()
    candidates = [Action(*row) for row in observation["legalActions"]]
    prior, _ = policy.predict(observation, candidates)
    # Spend at least half of a normal budget on revisits, rather than one uniform visit per tile.
    keep = root_subset(candidates, prior, rng, min(root_size, max(2, simulations // 2)), noise)
    root_actions = [candidates[index] for index in keep]
    root_prior = root_priors(candidates, prior, keep)
    if noise and len(root_actions) > 1:
        root_prior = exploration_prior(root_actions, root_prior, rng)
    snapshots = [world.battle.save() for world in worlds]
    world = workspace.scratch
    roots = {}
    reached = 0
    for simulation in range(simulations):
        if max_ms is not None and simulation and (time.perf_counter() - began) * 1000 >= max_ms:
            break
        index = simulation % len(worlds)
        world.adopt(snapshots[index], worlds[index])
        if index not in roots:
            roots[index] = first_ply(world, team, root_actions, root_prior, opponent)
        node, path = root, []
        for ply in range(depth):
            value, choices = roots[index] if ply == 0 else later_ply(world, team, policy, opponent)
            if choices is None:
                break
            own_actions, priors, enemy_actions, enemy_priors = choices
            ours = pick(node.own, own_actions, priors, rng, 1.5, cover=ply == 0)
            theirs = pick(node.enemy, enemy_actions, enemy_priors, rng, 1.5)
            path.append((node, ours, theirs))
            actions = [Action(-1), Action(-1)]
            actions[team], actions[1 - team] = ours, theirs
            world.play(actions, first_ticks if ply == 0 and first_ticks else step_ticks)
            reached = max(reached, ply + 1)
            node = node.children.setdefault((ours, theirs), Node())
        else:
            value = leaf_value(world, team, policy)
        for visited, ours, theirs in reversed(path):
            visited.visits += 1
            for edges, action, result in (
                (visited.own, ours, value),
                (visited.enemy, theirs, -value),
            ):
                edges[action]["n"] += 1
                edges[action]["w"] += result
    visits = np.array([root.own.get(action, {}).get("n", 0) for action in root_actions], np.float32)
    target = visits / visits.sum() if visits.sum() else root_prior
    return {
        "actions": root_actions,
        "target": target,
        "values": [
            root.own.get(action, {}).get("w", 0) / max(1, root.own.get(action, {}).get("n", 0))
            for action in root_actions
        ],
        "simulations": int(visits.sum()),
        "elapsedMs": (time.perf_counter() - began) * 1000,
        "beliefHypotheses": [sum(map(len, pool.values())) for pool in sampler.openings],
        "deckHypotheses": [len(pool) for pool in sampler.openings],
        "maxDepth": reached,
        "depthLimit": depth,
        "maxLookaheadSeconds": (
            ((first_ticks or step_ticks) + (reached - 1) * step_ticks) / 20 if reached else 0
        ),
        "rootCandidates": len(candidates),
        "rootConditioningAttempts": attempts,
        "continuedHypotheses": continued,
        "reconstruction": "public_board_exact"
        if all(row["mode"] == "exact" for row in conditioning)
        else "public_board_position_bounded",
        "rootConditioning": conditioning,
        "source": "public_history_information_set_puct",
    }
