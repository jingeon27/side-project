import gzip
import hashlib
import json
import os
import tempfile
from pathlib import Path


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w") as file:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def seed_for(domain, *parts):
    # Independent streams for world RNG, search, training shuffle and holdout.
    return int.from_bytes(
        hashlib.sha256(json.dumps([domain, *parts]).encode()).digest()[:4], "little"
    )


def write_episode(path, episode):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf8") as file:
        file.write(json.dumps(episode, ensure_ascii=False, separators=(",", ":")) + "\n")


def read_episode(path):
    with gzip.open(path, "rt", encoding="utf8") as file:
        return json.load(file)
