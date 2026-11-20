"""A frame has one match and partition forever. Blind measurement never exposes model guesses."""

import hashlib
import io
import json
import re
import sqlite3
import time
from contextlib import closing, contextmanager
from uuid import UUID

from PIL import Image

from clash_bot.paths import DATA_DIR
from clash_bot.perception.labels.schema import Label

ROOT = DATA_DIR / "trophy/labels"
MAX_BYTES = 3_000_000
SCHEMA = """
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, role TEXT NOT NULL, split TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS frames(sha TEXT PRIMARY KEY, match TEXT NOT NULL REFERENCES matches(id),
 name TEXT NOT NULL, at INTEGER NOT NULL, png BLOB NOT NULL, rank TEXT NOT NULL, priority REAL NOT NULL,
 raw TEXT, evidence TEXT, UNIQUE(match,name));
CREATE TABLE IF NOT EXISTS timings(sha TEXT,revision INTEGER,seconds REAL,PRIMARY KEY(sha,revision));
CREATE TABLE IF NOT EXISTS streams(match TEXT PRIMARY KEY REFERENCES matches(id),total INTEGER NOT NULL, uniqueFrames INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS by_time ON frames(match,at);
CREATE TABLE IF NOT EXISTS frame_kinds(sha TEXT REFERENCES frames(sha),kind TEXT,PRIMARY KEY(sha,kind));
CREATE INDEX IF NOT EXISTS by_match ON frames(match,rank);
CREATE TABLE IF NOT EXISTS reviews(sha TEXT REFERENCES frames(sha), revision INTEGER, reviewed REAL NOT NULL,
 label TEXT NOT NULL, PRIMARY KEY(sha,revision));
CREATE VIEW IF NOT EXISTS current_reviews AS SELECT sha,max(revision) AS revision FROM reviews GROUP BY sha;
"""


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


@contextmanager
def database(root=ROOT):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with closing(sqlite3.connect(root / "frames.sqlite3", timeout=20)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(SCHEMA)
        with db:
            yield db


def partition(match, role):
    if str(UUID(match)) != match or role not in ("training", "baseline", "candidate"):
        raise ValueError("Requires a current, identified trophy match")
    if role != "training" or int(digest(match.encode())[:8], 16) % 5 == 0:
        return "measurement"
    return "coverage"


def add_frame(db, match, role, directory, name, expected, at, raw=None, evidence=None):
    split = partition(match, role)
    if not re.fullmatch(r"[a-z0-9_-]+\.png", name) or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("Invalid screenshot identity")
    if type(at) is not int or at < 0:
        raise ValueError("Invalid frame time")
    if (raw is None) != (evidence is None) or (
        evidence is not None and not re.fullmatch(r"[a-f0-9]{64}", evidence)
    ):
        raise ValueError("Capture-time perception requires a behavior fingerprint")
    path = (directory / name).resolve()
    if path.parent != directory.resolve() or path.stat().st_size > MAX_BYTES:
        raise ValueError("Invalid screenshot path or size")
    blob = path.read_bytes()
    if digest(blob) != expected:
        raise ValueError("Screenshot checksum changed")
    with Image.open(io.BytesIO(blob)) as im:
        if im.format != "PNG" or im.size != (368, 652):
            raise ValueError("Expected normalized trophy PNG")
        im.verify()
    encoded = json.dumps(raw, sort_keys=True, allow_nan=False) if raw is not None else None
    db.execute("INSERT OR IGNORE INTO matches VALUES (?,?,?)", (match, role, split))
    if db.execute("SELECT role FROM matches WHERE id=?", (match,)).fetchone()[0] != role:
        raise ValueError("Match role changed")
    rank = digest((match + "/" + name).encode())
    previous = db.execute(
        "SELECT match,name,sha,at,raw,evidence FROM frames WHERE sha=? OR (match=? AND name=?)",
        (expected, match, name),
    ).fetchall()
    if previous:
        if len(previous) == 1 and tuple(previous[0]) == (
            match,
            name,
            expected,
            at,
            encoded,
            evidence,
        ):
            return False
        if all(r["match"] != match or r["name"] != name for r in previous):
            return False  # Identical pixels have one owner, including across partitions.
        raise ValueError("Conflicting immutable frame evidence")
    units = (raw or {}).get("units", [])
    if not isinstance(units, list) or any(not isinstance(unit, dict) for unit in units):
        raise ValueError("Invalid capture detections")
    scores = [
        u["confidence"]
        for u in units
        if isinstance(u.get("confidence"), (float, int)) and 0 <= u["confidence"] <= 1
    ]
    priority = 1 - min(scores) if scores else 0
    if raw and split == "coverage":
        prev = db.execute(
            "SELECT at,raw FROM frames WHERE match=? AND at<? AND raw IS NOT NULL ORDER BY at DESC LIMIT 1",
            (match, at),
        ).fetchone()
        if prev and at - prev["at"] <= 2000:
            earlier = json.loads(prev["raw"])
            # Compare only near-coincident observations of the same side. A switch is a review
            # lead, never an object identity. A numeric confirmed spend can reveal an inconsistent meter.
            switched = any(
                a.get("side") == b.get("side") in ("blue", "red")
                and a.get("kind") != b.get("kind")
                and all(
                    type(v) in (float, int)
                    for v in (a.get("x"), a.get("y"), b.get("x"), b.get("y"))
                )
                and abs(a["x"] - b["x"]) < 9
                and abs(a["y"] - b["y"]) < 7
                for a in earlier.get("units", [])
                for b in units
            )
            priority += 0.25 * switched
            prev_mana, now_mana, spent = (
                earlier.get("elixir"),
                raw.get("elixir"),
                raw.get("confirmedOwnSpend"),
            )
            if all(type(v) in (float, int) for v in (prev_mana, now_mana, spent)):
                priority += 0.15 * (abs(prev_mana - now_mana - spent) > 1)
    db.execute(
        "INSERT INTO frames VALUES (?,?,?,?,?,?,?,?,?)",
        (expected, match, name, at, blob, rank, priority, encoded, evidence),
    )
    db.executemany(
        "INSERT OR IGNORE INTO frame_kinds VALUES (?,?)",
        [(expected, u["kind"]) for u in units if isinstance(u.get("kind"), str)],
    )
    return True


def import_run(db, directory):
    record = json.loads((directory / "trajectory.json").read_bytes())
    if record.get("format") != "trophy-own-trajectory-v1" or record["id"] != directory.name:
        raise ValueError("Requires a sealed current-format trophy trajectory")
    role = record["role"]
    if role == "recovery" or (role == "training" and record.get("learningEligible") is not True):
        return 0
    added = 0
    stream = directory / "screen-stream"
    if stream.is_dir():
        from clash_bot.perception.labels.capture import seal_stream

        seal = json.loads((stream / "seal.json").read_bytes())
        plan = {
            "directory": str(directory),
            "id": record["id"],
            "behaviorSHA256": record["behaviorSHA256"],
        }
        seal_stream(plan, seal["total"])
        names = set()
        for seq in range(1, seal["total"] + 1):
            row = json.loads((stream / f"{seq:06d}.json").read_bytes())
            if (
                row["sequence"] != seq
                or row["behaviorSHA256"] != plan["behaviorSHA256"]
                or row["image"] in names
            ):
                raise ValueError("Invalid sealed frame stream")
            names.add(row["image"])
            added += add_frame(
                db,
                record["id"],
                role,
                stream,
                row["image"],
                row["imageSHA256"],
                row["at"],
                row["raw"],
                row["behaviorSHA256"],
            )
        count = db.execute("SELECT count(*) FROM frames WHERE match=?", (record["id"],)).fetchone()[
            0
        ]
        db.execute(
            "INSERT OR IGNORE INTO streams VALUES(?,?,?)", (record["id"], seal["total"], count)
        )
        return added
    captures = {}
    for sidecar in sorted((directory / "screen-evidence").glob("*.json")):
        frame = json.loads(sidecar.read_bytes())
        if (
            frame["behaviorSHA256"] != record["behaviorSHA256"]
            or frame["image"] != sidecar.stem + ".png"
        ):
            raise ValueError("Capture belongs to a different behavior or frame")
        captures[frame["image"]] = frame["imageSHA256"]
        added += add_frame(
            db,
            record["id"],
            role,
            sidecar.parent,
            frame["image"],
            frame["imageSHA256"],
            frame["at"],
            frame["raw"],
            frame["behaviorSHA256"],
        )
    for row in record["transitions"]:
        if row["image"] in captures:
            if captures[row["image"]] != row["imageSHA256"]:
                raise ValueError("Transition and scan-time screenshots differ")
            continue
        if row["confirmation"] in ("verified_card_input", "verified_wait"):
            added += add_frame(
                db, record["id"], role, directory, row["image"], row["imageSHA256"], row["at"]
            )
    return added


def save_label(db, label: Label, expected_revision: int):
    db.execute("BEGIN IMMEDIATE")
    sha = label.frameSHA256
    if not db.execute("SELECT 1 FROM frames WHERE sha=?", (sha,)).fetchone():
        raise ValueError("Unknown frame")
    prior = db.execute(
        "SELECT revision,label FROM reviews WHERE sha=? ORDER BY revision DESC LIMIT 1", (sha,)
    ).fetchone()
    if expected_revision != (prior["revision"] if prior else 0):
        raise ValueError("Label changed since it was opened")
    if prior and json.loads(prior["label"])["reviewer"] == "human" and label.reviewer != "human":
        raise ValueError("A human review requires a human correction")
    revision = expected_revision + 1
    db.execute(
        "INSERT INTO reviews VALUES (?,?,?,?)",
        (sha, revision, time.time(), label.model_dump_json()),
    )
    return revision


def queue(db, split, limit=20, revisit=False):
    if split not in ("coverage", "measurement") or not 1 <= limit <= 100:
        raise ValueError("Invalid queue request")
    # Limit daily assignments per partition, balance matches before ranking. Measurement ordering
    # is independent of predictions, labels and detection success; the blind view has no raw outputs.
    order = "novel DESC, priority DESC, rank" if split == "coverage" else "rank"
    novel = (
        """EXISTS(SELECT 1 FROM frame_kinds fk WHERE fk.sha=f.sha AND fk.kind NOT IN
       (SELECT json_extract(o.value,'$.kind') FROM reviews rv JOIN current_reviews c ON c.sha=rv.sha AND c.revision=rv.revision
        JOIN frames known ON known.sha=rv.sha JOIN matches mk ON mk.id=known.match, json_each(rv.label,'$.objects') o
        WHERE mk.split='coverage'))"""
        if split == "coverage"
        else "0"
    )
    rows = db.execute(
        f"""WITH candidates AS (
       SELECT f.sha,f.match,f.name,f.at,f.priority,f.rank,coalesce(c.revision,0) revision,{novel} novel
       FROM frames f JOIN matches m ON m.id=f.match LEFT JOIN current_reviews c ON c.sha=f.sha WHERE m.split=?),
       pool AS (SELECT *,row_number() OVER(PARTITION BY match ORDER BY {order}) n FROM candidates)
       SELECT sha,match,name,at,revision FROM pool WHERE revision {">" if revisit else "="} 0
       ORDER BY n,{order} LIMIT ?""",
        (split, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def labeled(db):
    return db.execute("""SELECT f.sha,f.match,f.at,m.split,r.label,r.revision,s.total IS NOT NULL AS fullStream FROM frames f LEFT JOIN streams s ON s.match=f.match
      JOIN matches m ON m.id=f.match JOIN current_reviews c ON c.sha=f.sha
      JOIN reviews r ON r.sha=c.sha AND r.revision=c.revision ORDER BY f.sha""")


def summary(db):
    result = {}
    for split in ("coverage", "measurement"):
        row = db.execute(
            """SELECT count(DISTINCT match),count(*),count(revision),count(raw)
          FROM frames JOIN matches ON id=match LEFT JOIN current_reviews USING(sha) WHERE split=?""",
            (split,),
        ).fetchone()
        result[split] = dict(
            zip(("matches", "frames", "reviewed", "captureTimeOutputs"), row, strict=True)
        )
    return result
