"""Pinned model identity shared by installer, inference and learning."""

import hashlib
import json
from pathlib import Path

from clash_bot.paths import CONTRACTS_DIR

MODEL = json.loads((CONTRACTS_DIR / "model.json").read_text())


def require_model_directory(directory):
    name = Path(directory).name
    if name != MODEL["directory"]:
        raise ValueError("Unknown pinned Qwen model directory: " + name)


def verify_model(directory, spec):
    for name, expected in spec["files"].items():
        with (Path(directory) / name).open("rb") as handle:
            actual = hashlib.file_digest(handle, "sha256").hexdigest()
        if actual != expected:
            raise ValueError("Base model checksum mismatch: " + name)
