"""Validate a separate simulation-supervision contract, never on-policy PPO."""
import hashlib
import json
import math
from pathlib import Path


def load_search_targets(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    data = json.loads(raw)
    if (data.get('format') != 'clash-arena-qwen-search-v1'
            or data.get('source') != 'local_native_selfplay_public_before_state'
            or data.get('teacherQualifiedForRealGame') is not False):
        raise ValueError('Unknown or misrepresented simulation dataset')
    rows = data['samples']
    if not 1 <= len(rows) <= 16 or len({row['id'] for row in rows}) != len(rows):
        raise ValueError('Expected 1..16 distinct before-position search targets')
    for row in rows:
        target, choices = row['target'], row['choices']
        if (row['rulesID'] != data['rulesID'] or row['terminalOutcome'] not in (-1, 0, 1)
                or row['search']['source'] != 'public_history_information_set_puct' or row['search']['simulations'] < 8
                or not 2 <= len(choices) <= 26 or len(set(choices)) != len(choices)
                or len(target) != len(choices) or any(not math.isfinite(p) or p < 0 for p in target)
                or abs(sum(target) - 1) > 1e-4):
            raise ValueError('Invalid rule, terminal result or soft search target')
        image = (path.parent / row['image']).resolve()
        if image.parent != path.parent or hashlib.sha256(image.read_bytes()).hexdigest() != row['imageSHA256']:
            raise ValueError('Search before-image escaped its directory or changed')
    return data, hashlib.sha256(raw).hexdigest(), path
