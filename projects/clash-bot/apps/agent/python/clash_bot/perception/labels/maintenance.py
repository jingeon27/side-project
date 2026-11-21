"""Idempotent work for the supervisor; evaluation is isolated from the arena's model and process."""

import fcntl
import json
from collections import Counter
from datetime import UTC, datetime

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR
from clash_bot.perception.labels.reader import SCREEN
from clash_bot.perception.labels.schema import CATALOGUE, UNKNOWN
from clash_bot.perception.labels.store import ROOT, database, digest, import_run, labeled, summary


def ingest(source):
    total = 0
    errors = []
    files = (
        [source / "trajectory.json"]
        if (source / "trajectory.json").is_file()
        else sorted(source.glob("*/runs/*/trajectory.json"))
    )
    with database() as db:
        db.execute("CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY, sha TEXT NOT NULL)")
        for path in files:
            try:
                with db:
                    prev = db.execute(
                        "SELECT sha FROM imports WHERE id=?", (path.parent.name,)
                    ).fetchone()
                    sha = digest(path.read_bytes())
                    if prev:
                        if prev[0] != sha:
                            raise ValueError("Sealed trajectory changed")
                        continue
                    total += import_run(db, path.parent)
                    db.execute("INSERT INTO imports VALUES(?,?)", (path.parent.name, sha))
            except (ValueError, OSError, KeyError) as exc:
                errors.append({"match": path.parent.name, "error": str(exc)})
    return {"newFrames": total, "failed": errors}


def progress():
    with database() as db:
        totals = summary(db)
        timings = [
            r[0]
            for r in db.execute(
                "SELECT t.seconds FROM timings t JOIN reviews r USING(sha,revision) ORDER BY r.reviewed LIMIT 20"
            )
        ]
        repeats = list(
            db.execute("""SELECT a.label,b.label FROM reviews a JOIN reviews b ON a.sha=b.sha AND b.revision=a.revision+1
                      WHERE b.reviewed-a.reviewed>=172800 AND json_extract(a.label,'$.reviewer')='human'
                      AND json_extract(b.label,'$.reviewer')='human' ORDER BY b.reviewed LIMIT 15""")
        )
        agreements = Counter()
        for first, second in repeats:
            a, b = json.loads(first), json.loads(second)
            for key in (
                "elixir",
                "nextCard",
                "hand",
                "towers",
                "objects",
                "effects",
                "opponentPlays",
            ):
                agreements[key] += a[key] == b[key]

        counts = Counter()
        coverage = Counter()
        for row in labeled(db):
            label = json.loads(row["label"])
            split, reviewer = row["split"], label["reviewer"]
            counts[split, reviewer] += 1
            if reviewer == "human" and split == "measurement" and row["fullStream"]:
                counts["objects"] += sum(
                    o["kind"] != UNKNOWN and o["side"] != UNKNOWN for o in label["objects"]
                )
                counts["slots"] += sum(s["card"] != UNKNOWN for s in label["hand"])
                if label["elixir"] != UNKNOWN:
                    counts["elixir", label["elixir"]] += 1
            if reviewer == "human" and split == "coverage":
                coverage.update((o["kind"], o["side"]) for o in label["objects"])
    for split, info in totals.items():
        info["humanReviewed"] = counts[split, "human"]
        info["assistantReviewed"] = counts[split, "visual_assistant"]
        info["pending"] = info["frames"] - info["reviewed"]
    complete = sum(
        coverage[b, "red"] + coverage[b, "blue"] >= SCREEN["coverage"]["perBody"]
        and min(coverage[b, "red"], coverage[b, "blue"]) >= SCREEN["coverage"]["perSide"]
        for b in CATALOGUE["bodies"]
        if b != "?"
    )
    return {
        "first20HumanReviews": {
            "observed": len(timings),
            "activeSeconds": sum(timings) if timings else None,
        },
        "delayedRepeat": {"pairs": len(repeats), "exactFieldAgreements": dict(agreements)},
        "partitions": totals,
        "humanMeasurement": {
            "objects": counts["objects"],
            "slots": counts["slots"],
            "elixirByValue": [counts["elixir", m] for m in range(11)],
        },
        "classesMeetingCoverage": complete,
        "labelableBodies": len(CATALOGUE["bodies"]) - 1,
        "targets": SCREEN["measurement"],
    }


def maintain(source=None):
    from clash_bot.perception.labels.learning import EVAL, evaluate

    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "maintenance.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        capture = ingest(source or DATA_DIR / "trophy/learning/experiments")
        status = progress()
        current = EVAL / "latest.json"
        last = json.loads(current.read_bytes()) if current.exists() else {}
        # Automatic training uses newly confirmed human coverage; the assistant pilot is explicit.
        human = status["partitions"]["coverage"]["humanReviewed"]
        last_human = last.get("humanTrainingFrames", 0)
        if (
            human - last_human >= SCREEN["newCoverageFrames"]
            and status["partitions"]["measurement"]["humanReviewed"]
        ):
            last = evaluate()
        report = {
            "checkedAt": datetime.now(UTC).isoformat(),
            "ingest": capture,
            **status,
            "lastEvaluation": {
                k: last[k]
                for k in ("id", "trainingFrames", "measurementFrames", "adopted", "gateReasons")
                if k in last
            },
            "newHumanCoverageForTraining": max(0, human - last.get("humanTrainingFrames", 0)),
        }
        atomic_json(ROOT / "status.json", report)
        return report
