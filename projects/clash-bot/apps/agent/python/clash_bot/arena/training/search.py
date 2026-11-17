"""Information-set PUCT with simultaneous responses and sampled hidden draws.

Root worlds come from PUBLIC play history, never the real engine's save/RNG/hand.
The two action bandits use opposite values. A bounded visible-material heuristic
bootstraps an untrained value head; this is not claimed to be pure AlphaZero.
"""

import math
import time

import numpy as np

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR

from ..sim.belief import BeliefSampler
from ..sim.candidates import legal_actions
from ..sim.engine import Arena
from ..sim.rules import CARDS, Action, command, digest, rules_identity


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


class Node:
    def __init__(self):
        self.own, self.enemy, self.children = {}, {}, {}
        self.visits = 0


class Workspace:
    def __init__(self, particles=2):
        self.worlds = [Arena(index) for index in range(particles)]
        self.scratch = self.worlds[0].clone()


def pick(edges, actions, priors, rng, explore):
    for action, prior in zip(actions, priors):
        if action not in edges:
            edges[action] = {"n": 0, "w": 0.0, "p": float(prior), "available": 0}
        edges[action]["available"] += 1

    # Availability, not visits to unavailable hidden-hand actions, sets the UCB.
    def score(action):
        edge = edges[action]
        return edge["w"] / max(1, edge["n"]) + explore * edge["p"] * math.sqrt(
            edge["available"]
        ) / (1 + edge["n"])

    scores = np.array([score(action) for action in actions])
    return actions[int(rng.choice(np.flatnonzero(scores >= scores.max() - 1e-12)))]


def root_subset(actions, prior, rng, size, explore):
    """Indices of the root candidates search expands: the `size` best by prior.

    While training they are sampled without replacement (Gumbel top-k), so placements the
    policy does not rank yet still get searched. Waiting is always among them.
    """
    if len(actions) <= size:
        return list(range(len(actions)))
    scores = np.log(np.maximum(prior, 1e-12))
    if explore:
        scores = scores + rng.gumbel(size=len(scores))
    keep = [int(index) for index in np.argsort(-scores, kind="stable")[:size]]
    wait = actions.index(Action(-1)) if Action(-1) in actions else None
    if wait is not None and wait not in keep:
        keep[-1] = wait
    return sorted(keep)


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
):
    """Search the best `root_size` of the observation's candidates.

    The first ply lasts `first_ticks` (the decision interval), later plies `step_ticks`.
    """
    began = time.perf_counter()
    rng = np.random.default_rng(seed)
    sampler = BeliefSampler(observation, seed)
    workspace = workspace or Workspace(particles)
    worlds, attempts = [], 0
    for index in range(particles):
        try:
            world, count = sampler.conditioned(into=workspace.worlds[index])
        except ValueError as error:
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
            raise ValueError(f"Public root reconstruction failed; evidence: {path}") from error
        attempts += count
        worlds.append(world)
    team = observation["team"]
    root = Node()
    candidates = [Action(*row) for row in observation["legalActions"]]
    prior, _ = policy.predict(observation, candidates)
    keep = root_subset(candidates, prior, rng, root_size, noise)
    root_actions = [candidates[index] for index in keep]
    root_prior = prior[keep] / prior[keep].sum()
    if noise and len(root_actions) > 1:
        root_prior = 0.75 * root_prior + 0.25 * rng.dirichlet(np.full(len(root_actions), 0.2))
    snapshots = [world.battle.save() for world in worlds]
    world = workspace.scratch
    reached = 0
    for simulation in range(simulations):
        if max_ms is not None and simulation and (time.perf_counter() - began) * 1000 >= max_ms:
            break
        index = simulation % len(worlds)
        world.adopt(snapshots[index], worlds[index])
        node, path = root, []
        for ply in range(depth):
            state = world.state()
            value = terminal(state, team)
            if value is not None:
                break
            own = world.observe(team, include_legal=False)
            own_actions = (
                [
                    action
                    for action in root_actions
                    if action.card == -1
                    or (
                        (cmd := command(world.battle, action, team, state)) is not None
                        and world.battle.check_deploy(*cmd) == 0
                    )
                ]
                if ply == 0
                else legal_actions(world.battle, team, state)
            )
            if not own_actions:
                value = position_value(own)
                break
            enemy_actions = legal_actions(world.battle, 1 - team, state)
            priors, estimate = policy.predict(own, own_actions)
            if ply == 0:
                priors = np.array(
                    [root_prior[root_actions.index(action)] for action in own_actions]
                )
                priors /= priors.sum()
            # Complete a bounded rollout even through new nodes. With 26
            # simultaneous choices per side, stopping at the first new joint
            # child would otherwise evaluate almost every move only 2s ahead.
            enemy_priors, _ = (opponent_policy or policy).predict(
                world.observe(1 - team, include_legal=False), enemy_actions
            )
            ours = pick(node.own, own_actions, priors, rng, 1.5)
            theirs = pick(node.enemy, enemy_actions, enemy_priors, rng, 1.5)
            path.append((node, ours, theirs))
            actions = [Action(-1), Action(-1)]
            actions[team], actions[1 - team] = ours, theirs
            world.play(actions, first_ticks if ply == 0 and first_ticks else step_ticks)
            reached = max(reached, ply + 1)
            node = node.children.setdefault((ours, theirs), Node())
        else:
            own = world.observe(team, include_legal=False)
            _, estimate = policy.predict(own, legal_actions(world.battle, team))
            value = terminal(own["state"], team)
            if value is None:
                value = 0.75 * estimate + 0.25 * position_value(own)
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
    others = sorted(set(range(len(candidates))) - set(keep))
    return {
        "actions": root_actions,
        "target": target,
        # Candidates the policy ranked but search did not expand; training uses some as negatives.
        "others": [candidates[index] for index in others],
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
        "reconstruction": "public_board_exact",
        "source": "public_history_information_set_puct",
    }
