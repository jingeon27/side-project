"""Pinned model identities shared by installer, inference and learning."""

import hashlib
import json
from pathlib import Path

MODELS = json.loads(Path(__file__).with_name('models.json').read_text())
DEFAULT_MODEL = '3.8-27b'


def detect_model(directory):
    name = Path(directory).name
    for key, spec in MODELS.items():
        if spec['directory'] == name:
            return {**spec, 'id': key}
    raise ValueError('Unknown pinned Qwen model directory: ' + name)


def verify_model(directory, spec):
    for name, expected in spec['files'].items():
        with (Path(directory) / name).open('rb') as handle:
            actual = hashlib.file_digest(handle, 'sha256').hexdigest()
        if actual != expected:
            raise ValueError('Base model checksum mismatch: ' + name)
