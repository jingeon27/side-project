"""Stage scan-time facts from an active match. Only sealed, eligible matches enter the label pool."""

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

from clash_bot.paths import DATA_DIR


def immutable(path, body):
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.link(name, path)
        except FileExistsError:
            if path.read_bytes() != body:
                raise ValueError("Conflicting capture evidence")
    finally:
        Path(name).unlink(missing_ok=True)


def capture(image, raw, data=DATA_DIR):
    path = Path(image).resolve()
    learning = (data / "trophy/learning").resolve()
    active = learning / "control/active.json"
    if not path.is_relative_to(learning / "experiments") or not active.exists():
        return False
    exp = Path(json.loads(active.read_bytes())["root"]).resolve()
    if not exp.is_relative_to(learning / "experiments") or path.parent.parent != exp / "runs":
        return False
    pending = json.loads((exp / "state.json").read_bytes()).get("pending")
    if (
        not pending
        or pending["role"] == "recovery"
        or path.parent != Path(pending["directory"])
        or path.parent.name != pending["id"]
    ):
        return False
    if not re.fullmatch(r"[a-z0-9_-]+\.png", path.name):
        raise ValueError("Invalid capture filename")
    data_bytes = path.read_bytes()
    sha = hashlib.sha256(data_bytes).hexdigest()
    dest = path.parent / "screen-evidence"
    immutable(dest / path.name, data_bytes)
    # The timestamp belongs to the captured PNG, and stays stable across retries.
    item = {
        "image": path.name,
        "imageSHA256": sha,
        "at": path.stat().st_mtime_ns // 1_000_000,
        "raw": raw,
        "behaviorSHA256": pending["behaviorSHA256"],
    }
    immutable(
        dest / (path.stem + ".json"), json.dumps(item, sort_keys=True, allow_nan=False).encode()
    )
    return True


def stream_frame(plan, item):
    """Persist one adapter observation before it decides whether there is a legal action."""
    from clash_bot.perception.labels.store import MAX_BYTES

    name, ordinal = item["image"], item["sequence"]
    if (
        not re.fullmatch(r"[a-z0-9_-]+\.png", name)
        or type(ordinal) is not int
        or not 1 <= ordinal <= 100000
    ):
        raise ValueError("Invalid capture sequence or filename")
    directory = Path(plan["directory"]).resolve()
    path = (directory / name).resolve()
    if directory.name != plan["id"] or path.parent != directory or path.stat().st_size > MAX_BYTES:
        raise ValueError("Frame escaped its active match")
    if type(item["at"]) is not int or item["at"] < 0 or not isinstance(item["raw"], dict):
        raise ValueError("Invalid capture time or recognition output")
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != item["imageSHA256"]:
        raise ValueError("Changed capture pixels")
    dest = directory / "screen-stream"
    event = {k: item[k] for k in ["sequence", "at", "image", "imageSHA256", "raw"]}
    event["behaviorSHA256"] = plan["behaviorSHA256"]
    encoded = json.dumps(event, sort_keys=True, allow_nan=False).encode()
    row = dest / f"{ordinal:06d}.json"
    if (dest / "seal.json").exists() and not row.exists():
        raise ValueError("Frame stream is sealed")
    immutable(dest / name, body)
    immutable(row, encoded)


def seal_stream(plan, total):
    if type(total) is not int or not 1 <= total <= 100000:
        raise ValueError("Invalid stream length")
    directory = Path(plan["directory"]) / "screen-stream"
    names = {p.name for p in directory.glob("[0-9]*.json")}
    if names != {f"{i:06d}.json" for i in range(1, total + 1)}:
        raise ValueError("Incomplete frame sequence")
    immutable(
        directory / "seal.json",
        json.dumps(
            {"match": plan["id"], "total": total, "behaviorSHA256": plan["behaviorSHA256"]},
            sort_keys=True,
        ).encode(),
    )


def worker():
    import sys

    from clash_bot.channel import protocol_channel

    emit = protocol_channel()
    emit({"type": "ready"})
    for line in sys.stdin:
        try:
            data = json.loads(line)
            plan = data["plan"]
            if data["op"] == "frame":
                stream_frame(plan, data["item"])
            elif data["op"] == "seal":
                seal_stream(plan, data["total"])
            else:
                raise ValueError("Invalid frame operation")
            emit({"type": "result", "recorded": True})
        except (ValueError, KeyError, TypeError, OSError) as exc:
            emit({"type": "error", "message": str(exc)})


if __name__ == "__main__":
    worker()
