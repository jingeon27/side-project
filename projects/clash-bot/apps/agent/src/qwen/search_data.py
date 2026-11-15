"""Validate a separate simulation-supervision contract, never on-policy PPO."""
import hashlib
import json
import math
from pathlib import Path


def load_search_targets(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    data = json.loads(raw)
    tactical = data.get('format') == 'counterpush-tactical-targets-v2'
    if (not ((data.get('format') == 'clash-arena-qwen-search-v1' and data.get('source') == 'local_native_selfplay_public_before_state')
             or (tactical and data.get('source') == 'local_native_counterfactual_v2' and data.get('controllerVersion') == 2))
            or data.get('teacherQualifiedForRealGame') is not False):
        raise ValueError('Unknown or misrepresented simulation dataset')
    rows = data['samples']
    if tactical and (data.get('split') != 'train' or not 1 <= data.get('trainingEpochs',1) <= 4):
        raise ValueError('Heldout or invalid-epoch tactical data cannot train')
    if not 1 <= len(rows) <= 16 or len({row['id'] for row in rows}) != len(rows):
        raise ValueError('Expected 1..16 distinct before-position search targets')
    for row in rows:
        target, choices = row['target'], row['choices']
        if (row['rulesID'] != data['rulesID']
                or not 2 <= len(choices) <= 26 or len(set(choices)) != len(choices)
                or len(target) != len(choices) or any(not math.isfinite(p) or p < 0 for p in target)
                or abs(sum(target) - 1) > 1e-4):
            raise ValueError('Invalid rule, terminal result or soft search target')
        if not tactical and (row['terminalOutcome'] not in (-1, 0, 1) or row['search']['source'] != 'public_history_information_set_puct' or row['search']['simulations'] < 8):
            raise ValueError('Unverified self-play outcome or search')
        if tactical:
            evidence = row['evidence']; gains = evidence['towerImprovement']
            if (row.get('controllerVersion') != 2 or evidence.get('kind') != 'paired_passive_future_rollout'
                    or evidence.get('actionOrder') != 'seeded_permutation'
                    or evidence.get('futureEnemyDeployments') != 0 or evidence.get('horizonTicks',0) < 160
                    or len(gains) != len(choices) or any(not math.isfinite(value) for value in gains)
                    or max(gains) < 80 or abs(max(gains)-evidence['bestImprovement']) > 1e-5
                    or any(probability > 0 and gain < max(gains)-35 for probability,gain in zip(target,gains))):
                raise ValueError('Unverified tactical improvement target')
        image = (path.parent / row['image']).resolve()
        if image.parent != path.parent or hashlib.sha256(image.read_bytes()).hexdigest() != row['imageSHA256']:
            raise ValueError('Search before-image escaped its directory or changed')
    return data, hashlib.sha256(raw).hexdigest(), path
