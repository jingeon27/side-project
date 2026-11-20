"""Train only on coverage matches. Rerun each held-out frame, including detector misses."""

import fcntl
import io
import json
from collections import Counter

import numpy as np
from PIL import Image

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR
from clash_bot.perception.labels.metrics import Metrics
from clash_bot.perception.labels.reader import SCREEN, Reader
from clash_bot.perception.labels.schema import UNKNOWN
from clash_bot.perception.labels.store import database, digest, labeled

EVAL = DATA_DIR / "trophy/perception-eval"


class Head:
    def __init__(self, cards, weights):
        self.cards = cards
        self.weights = np.asarray(weights)
        if self.weights.shape != (384, len(cards)) or not np.isfinite(self.weights).all():
            raise ValueError("Invalid visual head")

    def predict(self, features):
        scores = features @ self.weights
        return [
            self.cards[i] if row[i] >= 0.36 else UNKNOWN
            for row, i in zip(scores, scores.argmax(axis=1))
        ]

    def snapshot(self):
        return {"cards": self.cards, "weights": self.weights.tolist()}


def fit(reader, rows, read_png):
    features = []
    labels = []
    for row in rows:
        if row["split"] != "coverage":
            raise ValueError("A measurement match entered the training set")
        label = json.loads(row["label"])
        with Image.open(io.BytesIO(read_png(row["sha"]))) as image:
            vectors = reader.features(image)
        for slot, vector in zip(label["hand"], vectors, strict=True):
            if slot["card"] != UNKNOWN:
                features.append(vector)
                labels.append(slot["card"])
    cards = sorted(set(labels))
    if len(cards) < 2:
        return None
    # Regularized multiclass least squares on a frozen encoder, balanced by card frequency.
    counts = Counter(labels)
    x = np.asarray(features)
    y = np.eye(len(cards))[[cards.index(label) for label in labels]]
    weights = np.asarray([len(labels) / (len(cards) * counts[label]) for label in labels])
    xt = x.T * weights
    return Head(cards, np.linalg.solve(xt @ x + 0.1 * np.eye(x.shape[1]), xt @ y))


def adoption(incumbent, candidate, cards, human_training):
    old, new = incumbent["hand"], candidate["hand"]
    reasons = []
    if not human_training:
        reasons.append("coverage_requires_human_confirmation")
    if new["total"] < SCREEN["measurement"]["slots"]:
        reasons.append("insufficient_blind_human_slots")
    if not new["total"] or new["count"] <= old["count"]:
        reasons.append("no_overall_improvement")
    for metric in ("nextCard", "elixir"):
        a, b = incumbent[metric], candidate[metric]
        if b["total"] < SCREEN["measurement"]["slots"] // 4 or a["count"] > b["count"]:
            reasons.append("insufficient_or_regressed:" + metric)
    for value, measurement in candidate["elixirByValue"].items():
        if measurement["total"] < SCREEN["measurement"]["perElixir"]:
            reasons.append("underrepresented_elixir:" + str(value))
    for group in ("nextByCard", "elixirByValue"):
        for key, b in candidate[group].items():
            a = incumbent[group][key]
            if (
                a["rate"] is not None
                and a["rate"] - b["rate"] > SCREEN["handGate"]["maximumClassRegression"]
            ):
                reasons.append("regressed:" + group + ":" + str(key))
    for card in sorted(set(cards) | set(incumbent["handByCard"])):
        a = incumbent["handByCard"].get(card)
        b = candidate["handByCard"].get(card)
        if not a or not b or b["total"] < SCREEN["handGate"]["minimumPerCard"]:
            reasons.append("underrepresented:" + card)
        elif a["rate"] - b["rate"] > SCREEN["handGate"]["maximumClassRegression"]:
            reasons.append("regressed:" + card)
    return reasons


def active_head(root, fingerprint):
    pointer = root / "adopted.json"
    if not pointer.exists():
        return None, None
    meta = json.loads(pointer.read_bytes())
    if meta["encoder"] != fingerprint:
        return None, None
    path = root / "heads" / (meta["sha256"] + ".json")
    raw = path.read_bytes()
    if digest(raw) != meta["sha256"]:
        raise ValueError("Published hand head checksum mismatch")
    head = json.loads(raw)
    return Head(head["cards"], head["weights"]), meta["sha256"]


def evaluate(root=EVAL, reader=None):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (root / "evaluation.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with database() as db:
            return _evaluate(root, reader or Reader(), db)


def _evaluate(root, reader, db):
    rows = list(labeled(db))

    def read_png(sha):
        blob = db.execute("SELECT png FROM frames WHERE sha=?", (sha,)).fetchone()[0]
        if digest(blob) != sha:
            raise ValueError("Stored frame checksum differs")
        return blob

    training = [r for r in rows if r["split"] == "coverage"]
    held = [r for r in rows if r["split"] == "measurement"]
    human = [r for r in training if json.loads(r["label"])["reviewer"] == "human"]
    confirmed = len(human) >= SCREEN["newCoverageFrames"]
    used = human if confirmed else training
    candidate = fit(reader, used, read_png)
    baseline, baseline_sha = active_head(root, reader.fingerprint)
    corpus = [
        (r["sha"], r["match"], r["revision"], digest(r["label"].encode()), r["split"]) for r in rows
    ]
    experiment = digest(json.dumps([reader.fingerprint, baseline_sha, corpus]).encode())
    folder = root / reader.fingerprint / experiment
    baselines = {s: Metrics() for s in ["pilot", "human"]}
    candidates = {s: Metrics() for s in baselines}
    hand_labels = Counter()
    for r in used:
        hand_labels.update(
            x["card"] for x in json.loads(r["label"])["hand"] if x["card"] != UNKNOWN
        )
    for r in held:
        blob = read_png(r["sha"])
        field = reader.vision.scan({"image": io.BytesIO(blob)})
        with Image.open(io.BytesIO(blob)) as image:
            observations = reader.observe(image, field, baseline)
            proposed = reader.observe(image, field, candidate) if candidate else None
        label = json.loads(r["label"])
        for scope in (
            ["pilot", "human"] if label["reviewer"] == "human" and r["fullStream"] else ["pilot"]
        ):
            baselines[scope].add(label, observations)
            if proposed:
                candidates[scope].add(label, proposed)
        atomic_json(
            folder / "frames" / (r["sha"] + ".json"),
            {
                "source": "current_code_replay",
                "sha256": r["sha"],
                "revision": r["revision"],
                "raw": observations,
                "candidateHUD": {k: proposed[k] for k in ("hand", "nextCard", "elixir")}
                if proposed
                else None,
            },
            compact=True,
        )
    report = {
        k: {
            "baseline": baselines[k].report(),
            "candidate": candidates[k].report() if candidate else None,
        }
        for k in baselines
    }
    head_sha = None
    if candidate:
        raw = (json.dumps(candidate.snapshot(), separators=(",", ":")) + "\n").encode()
        head_sha = digest(raw)
        atomic_json(root / "heads" / (head_sha + ".json"), candidate.snapshot(), compact=True)
        reasons = adoption(
            report["human"]["baseline"], report["human"]["candidate"], candidate.cards, confirmed
        )
    else:
        reasons = ["insufficient_coverage_cards"]
    result = {
        "format": "trophy-perception-evaluation-v1",
        "id": experiment,
        "perceptionSHA256": reader.fingerprint,
        "incumbentSHA256": baseline_sha,
        "candidateSHA256": head_sha,
        "reviewedFrames": len(rows),
        "trainingFrames": len(used),
        "humanTrainingFrames": len(human) if confirmed else 0,
        "trainingMatches": len({r["match"] for r in used}),
        "trainingHandSlots": hand_labels.total(),
        "trainingByCard": dict(hand_labels),
        "measurementMatches": len({r["match"] for r in held}),
        "measurementFrames": len(held),
        "reports": report,
        "adopted": not reasons,
        "gateReasons": reasons,
    }
    atomic_json(folder / "corpus.json", corpus)
    atomic_json(folder / "summary.json", result)
    if not reasons:
        atomic_json(
            root / "adopted.json",
            {"sha256": head_sha, "encoder": reader.fingerprint, "evaluation": experiment},
        )
    atomic_json(root / "latest.json", result)
    return result
