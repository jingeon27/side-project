"""Validate visual demonstrations independently of the browser and game inputs."""

import hashlib
import json
import math
from pathlib import Path

DEMONSTRATION_FORMAT = 'counterpush-card-lane-demonstrations-v1'


def load_demonstrations(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    dataset = json.loads(raw)
    if dataset.get('format') != DEMONSTRATION_FORMAT or dataset.get('source') != 'counterpush_live_screen':
        raise ValueError('Unsupported opponent demonstration source')
    samples = dataset.get('samples', [])
    if not isinstance(samples, list) or not 1 <= len(samples) <= 24:
        raise ValueError('Expected 1 to 24 visually verified demonstrations')
    if len({sample['id'] for sample in samples}) != len(samples):
        raise ValueError('Duplicate demonstration IDs')
    for sample in samples:
        if (sample.get('actor') != 'red_top' or sample.get('verified_actor') is not True
                or sample.get('absent_before') is not True):
            raise ValueError('Opponent action was not visually verified')
        confidence = sample.get('confidence', 0)
        if not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0.9 <= confidence <= 1:
            raise ValueError('Low demonstration confidence')
        if (sample.get('hand') is not None or sample.get('elixir') is not None
                or sample.get('exact_target') is not None):
            raise ValueError('Hidden opponent state must remain unknown')
        if sample.get('evidence') not in ('new_unit_visible', 'spell_effect_visible'):
            raise ValueError('Missing visual action evidence')
        gap = ((sample['after_at'] - sample['before_at']) / 1000
               if 'before_at' in sample and 'after_at' in sample
               else sample['before_seconds'] - sample['after_seconds'])
        if not 0 < gap <= 10:
            raise ValueError('Ambiguous opponent action time window')
        choices, targets = sample['choices'], sample['target_ids']
        if (not 2 <= len(choices) <= 26 or len(set(choices)) != len(choices)
                or not targets or not set(targets).issubset(choices)):
            raise ValueError('Invalid demonstration action labels')
        candidates = {candidate['id']: candidate for candidate in sample['candidates']}
        expected = []
        for choice in choices:
            candidate = candidates[choice]
            x = candidate['target']['x']
            lane = 'left' if x < 184 else 'right' if x > 184 else 'center'
            if candidate['card'] == sample['card'] and lane == sample['lane']:
                expected.append(choice)
        if set(targets) != set(expected):
            raise ValueError('Target label disagrees with observed card and lane')
        for image_key, hash_key in (('image', 'image_sha256'), ('evidence_image', 'evidence_sha256')):
            image = (path.parent / sample[image_key]).resolve()
            if not image.is_relative_to(path.parent / 'images'):
                raise ValueError('Demonstration image escaped the dataset directory')
            if hashlib.sha256(image.read_bytes()).hexdigest() != sample[hash_key]:
                raise ValueError('Demonstration image checksum mismatch')
    return dataset, hashlib.sha256(raw).hexdigest(), path
