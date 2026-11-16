import gzip
import hashlib
import json
from pathlib import Path


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
