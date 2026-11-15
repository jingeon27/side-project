"""Information-set PUCT with simultaneous responses and sampled hidden draws.

Root worlds come from PUBLIC play history, never the real engine's save/RNG/hand.
The two action bandits use opposite values. A bounded visible-material heuristic
bootstraps an untrained value head; this is not claimed to be pure AlphaZero.
"""
import math
import time

import numpy as np

from .engine import Action, Arena, BeliefSampler, command, legal_actions, public_board


def terminal(state, team):
    if not state['game_over']:
        return None
    return 0.0 if state['winner'] == 2 else 1.0 if state['winner'] == team else -1.0


def position_value(observation):
    state, team = observation['state'], observation['team']
    own, enemy = state['players'][team], state['players'][1 - team]
    hp = lambda player: sum(h / max(1, m) for h, m in zip(player['tower_hp'], player['tower_max_hp'])) / 3
    return float(np.tanh((hp(own) - hp(enemy)) * 2 + (own['crowns'] - enemy['crowns']) * .6))


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
            edges[action] = {'n': 0, 'w': 0.0, 'p': float(prior), 'available': 0}
        edges[action]['available'] += 1
    # Availability, not visits to unavailable hidden-hand actions, sets the UCB.
    def score(action):
        edge = edges[action]
        return edge['w'] / max(1, edge['n']) + explore * edge['p'] * math.sqrt(edge['available']) / (1 + edge['n'])
    scores = np.array([score(action) for action in actions])
    return actions[int(rng.choice(np.flatnonzero(scores >= scores.max() - 1e-12)))]


def search(observation, policy, seed, simulations=32, depth=5, step_ticks=40, particles=2,
           noise=False, max_ms=None, opponent_policy=None, workspace=None):
    began = time.perf_counter()
    rng = np.random.default_rng(seed)
    sampler = BeliefSampler(observation, seed)
    workspace = workspace or Workspace(particles)
    worlds, attempts = [], 0
    visible = public_board(observation['state'])
    for index in range(particles):
        for _ in range(16):
            world = sampler.sample(into=workspace.worlds[index])
            attempts += 1
            if public_board(world.state()) == visible:
                worlds.append(world)
                break
        else:
            raise ValueError('Public history hypotheses cannot reproduce the visible board; refuse imaginary-root search')
    team = observation['team']
    root = Node()
    root_actions = [Action(*row) for row in observation['legalActions']]
    root_prior, _ = policy.predict(observation, root_actions)
    if noise and len(root_actions) > 1:
        root_prior = .75 * root_prior + .25 * rng.dirichlet(np.full(len(root_actions), .2))
    snapshots = [world.battle.save() for world in worlds]
    world = workspace.scratch
    reached = 0
    for simulation in range(simulations):
        if max_ms is not None and simulation and (time.perf_counter() - began) * 1000 >= max_ms:
            break
        index = simulation % len(worlds)
        world.battle.load(snapshots[index])
        world.history = worlds[index].history.copy()
        world.initial_hands = worlds[index].initial_hands
        world.initial_next = worlds[index].initial_next
        node, path = root, []
        for ply in range(depth):
            state = world.state()
            value = terminal(state, team)
            if value is not None:
                break
            own = world.observe(team, include_legal=False)
            own_actions = ([action for action in root_actions if action.card == -1 or
                            ((cmd := command(world.battle, action, team, state)) is not None and world.battle.check_deploy(*cmd) == 0)]
                           if ply == 0 else legal_actions(world.battle, team, state))
            if not own_actions:
                value = position_value(own)
                break
            enemy_actions = legal_actions(world.battle, 1 - team, state)
            priors, estimate = policy.predict(own, own_actions)
            if ply == 0:
                priors = np.array([root_prior[root_actions.index(action)] for action in own_actions])
                priors /= priors.sum()
            # Complete a bounded rollout even through new nodes. With 26
            # simultaneous choices per side, stopping at the first new joint
            # child would otherwise evaluate almost every move only 2s ahead.
            enemy_priors, _ = (opponent_policy or policy).predict(world.observe(1 - team, include_legal=False), enemy_actions)
            ours = pick(node.own, own_actions, priors, rng, 1.5)
            theirs = pick(node.enemy, enemy_actions, enemy_priors, rng, 1.5)
            path.append((node, ours, theirs))
            actions = [Action(-1), Action(-1)]
            actions[team], actions[1 - team] = ours, theirs
            world.play(actions, step_ticks)
            reached = max(reached, ply + 1)
            node = node.children.setdefault((ours, theirs), Node())
        else:
            own = world.observe(team, include_legal=False)
            _, estimate = policy.predict(own, legal_actions(world.battle, team))
            value = terminal(own['state'], team)
            if value is None:
                value = .75 * estimate + .25 * position_value(own)
        for visited, ours, theirs in reversed(path):
            visited.visits += 1
            for edges, action, result in ((visited.own, ours, value), (visited.enemy, theirs, -value)):
                edges[action]['n'] += 1
                edges[action]['w'] += result
    visits = np.array([root.own.get(action, {}).get('n', 0) for action in root_actions], np.float32)
    target = visits / visits.sum() if visits.sum() else root_prior
    return {'actions': root_actions, 'target': target,
            'values': [root.own.get(action, {}).get('w', 0) / max(1, root.own.get(action, {}).get('n', 0)) for action in root_actions],
            'simulations': int(visits.sum()), 'elapsedMs': (time.perf_counter() - began) * 1000,
            'beliefHypotheses': [len(rows) for rows in sampler.openings], 'maxDepth': reached, 'depthLimit': depth,
            'maxLookaheadSeconds': reached * step_ticks / 20,
            'rootConditioningAttempts': attempts, 'reconstruction': 'public_board_exact',
            'source': 'public_history_information_set_puct'}
