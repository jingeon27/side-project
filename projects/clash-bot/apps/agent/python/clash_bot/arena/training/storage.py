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


# Training reads only these fields; the full episode keeps observations for exports.
REPLAY_FIELDS = (
    "features",
    "actions",
    "actionFeatures",
    "actionBias",
    "actionBiasWithoutTowers",
    "source",
    "target",
    "targetWithoutTowers",
    "outcome",
    "value",
)


def replay_path(path):
    path = Path(path)
    return path.with_name(path.name.removesuffix(".json.gz") + ".replay.json.gz")


def write_replay(path, episode):
    write_episode(
        replay_path(path),
        {
            "completed": episode["completed"],
            "rulesID": episode["rulesID"],
            "samples": [{key: row[key] for key in REPLAY_FIELDS} for row in episode["samples"]],
        },
    )


def read_episode(path):
    with gzip.open(path, "rt", encoding="utf8") as file:
        return json.load(file)
