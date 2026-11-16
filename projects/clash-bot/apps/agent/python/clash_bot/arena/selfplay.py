"""Both seats act through their own observation; only native terminal results train."""
import time

import numpy as np

from .engine import Action, Arena, legal_actions
from .policy import action_features, features
from .search import Workspace, search
from .storage import seed_for


def play_game(policies, game_id, rules_id, simulations=16, depth=5, step_ticks=40,
              training=True, max_ticks=6200, report=None):
    began = time.perf_counter()
    arena = Arena(seed_for('environment', game_id))
    workspace = Workspace(particles=2)
    choices = np.random.default_rng(seed_for('acting', game_id))
    samples, rejected, decisions, searches = [], 0, 0, 0
    while not arena.state()['game_over'] and arena.state()['tick'] < max_ticks:
        state = arena.state()
        selected = []
        for team, policy in enumerate(policies):
            observation = arena.observe(team)
            available = legal_actions(arena.battle, team, state)
            if len(available) == 1:
                selected.append(available[0]); continue
            result = search(observation, policy, seed_for('search', game_id, state['tick'], team),
                            simulations=simulations, depth=depth, step_ticks=step_ticks,
                            noise=training, opponent_policy=policies[1 - team], workspace=workspace)
            probabilities = result['target'].astype(np.float64)
            if training:
                temperature = 1 if state['tick'] < 1200 else .35
                probabilities = probabilities ** (1 / temperature)
                probabilities /= probabilities.sum()
                chosen = int(choices.choice(len(probabilities), p=probabilities))
            else:
                chosen = int(np.argmax(probabilities))
            selected.append(result['actions'][chosen])
            searches += result['simulations']
            decisions += 1
            if training:
                samples.append({'gameID': game_id, 'rulesID': rules_id, 'team': team,
                                'policyVersion': policy.metadata['version'], 'observation': observation,
                                'features': features(observation).tolist(),
                                'actions': [action.row() for action in result['actions']],
                                'actionFeatures': action_features(result['actions'], team).tolist(),
                                'target': result['target'].tolist(), 'chosen': chosen,
                                'search': {key: value for key, value in result.items() if key not in ('actions', 'target')},
                                'outcome': None})
        outcomes = arena.play(selected, step_ticks)
        rejected += sum(row[1] != 0 for row in outcomes)
        if report and decisions % 20 == 0:
            report({'gameID': game_id, 'tick': arena.state()['tick'], 'decisions': decisions, 'searches': searches})
    state = arena.state()
    completed = bool(state['game_over'])
    for sample in samples:
        sample['outcome'] = (0 if state['winner'] == 2 else 1 if state['winner'] == sample['team'] else -1) if completed else None
    return {'format': 'clash-arena-selfplay-v1', 'gameID': game_id, 'rulesID': rules_id,
            'policies': [{'version': policy.metadata['version'], 'weightsSHA256': policy.checksum()} for policy in policies],
            'completed': completed, 'winner': state['winner'] if completed else None,
            'crowns': [player['crowns'] for player in state['players']], 'tick': state['tick'],
            'elapsedSeconds': time.perf_counter() - began, 'rejectedCommands': rejected,
            'decisions': decisions, 'searchSimulations': searches, 'publicHistory': arena.history,
            'samples': samples if completed else [], 'truncatedSamplesDiscarded': 0 if completed else len(samples)}


def replay_samples(episodes, rules_id, max_samples=4096, seed=0):
    valid = []
    for episode in episodes:
        if not episode['completed']:
            continue
        if episode['rulesID'] != rules_id:
            continue  # A patch's dynamics/returns must not silently mix with this one.
        valid.extend(row for row in episode['samples'] if row['outcome'] in (-1, 0, 1))
    if len(valid) <= max_samples:
        return valid
    order = np.random.default_rng(seed).choice(len(valid), max_samples, replace=False)
    return [valid[index] for index in order]
