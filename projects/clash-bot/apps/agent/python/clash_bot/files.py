"""Durable JSON writes shared by the learner, promotion and self-play, without model imports."""

import json
import os
import tempfile
from pathlib import Path


def atomic_json(path, value, compact=False):
    # Readers see the old or the new file: write and fsync a sibling, then rename it over the target.
    # Compact output is for large machine-read files such as live policy weights.
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w") as file:
            if compact:
                json.dump(value, file, ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)
