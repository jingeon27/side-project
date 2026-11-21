"""One-to-one, side-aware maximum matching within one tile. Partial annotations cannot count false positives."""

import math
from collections import Counter

import numpy as np
from scipy.optimize import linear_sum_assignment

from clash_bot.perception.labels.reader import SCREEN
from clash_bot.perception.labels.schema import UNKNOWN


def differences(a, b):
    return (
        (b["x"] - a["x"]) / SCREEN["tileScale"]["x"],
        (b["y"] - a["y"]) / SCREEN["tileScale"]["y"],
    )


def pairs(labels, detected, effects=False):
    if not labels or not detected:
        return []
    # A forbidden edge costs more than all legal edges combined; then minimize displacement.
    invalid = len(labels) + len(detected) + 1
    costs = np.full((len(labels), len(detected)), invalid, dtype=float)
    for i, a in enumerate(labels):
        for j, b in enumerate(detected):
            distance = math.hypot(*differences(a, b))
            if distance <= 1 and (
                (effects and b.get("side", "unknown") == "unknown") or a["side"] == b.get("side")
            ):
                costs[i, j] = distance
    rows, cols = linear_sum_assignment(costs)
    return [(int(i), int(j)) for i, j in zip(rows, cols) if costs[i, j] <= 1]


def rate(n, d):
    return {"count": int(n), "total": int(d), "rate": n / d if d else None}


class Metrics:
    def __init__(self):
        self.n = Counter()
        self.hand = Counter()
        self.correct = Counter()
        self.next_cards, self.next_hits = Counter(), Counter()
        self.mana = Counter()
        self.mana_correct = Counter()
        self.confusion = Counter()
        self.axes = []
        self.bodies = Counter()
        self.body_hits = Counter()

    def add(self, label, raw):
        n = self.n
        n["frames"] += 1
        for slot, guess in zip(label["hand"], raw["hand"], strict=True):
            card = slot["card"]
            if card != UNKNOWN:
                self.hand[card] += 1
                self.correct[card] += card == guess
        mana = label["elixir"]
        if mana != UNKNOWN:
            self.mana[mana] += 1
            self.mana_correct[mana] += mana == raw["elixir"]
        if label["nextCard"] != UNKNOWN:
            self.next_cards[label["nextCard"]] += 1
            self.next_hits[label["nextCard"]] += label["nextCard"] == raw["nextCard"]
            n["next"] += 1
            n["hitNext"] += label["nextCard"] == raw["nextCard"]
        for category, outputs in [("objects", "units"), ("effects", "effectCandidates")]:
            actual = [x for x in label[category] if x["side"] != UNKNOWN]
            detected = raw[outputs]
            matched = pairs(actual, detected, category == "effects")
            n[category] += len(actual)
            n["matched" + category] += len(matched)
            if label[category + "Complete"] and len(actual) == len(label[category]):
                n["full" + category] += 1
                n["extras" + category] += len(detected) - len(matched)
                n["detected" + category] += len(detected)
            for i, j in matched:
                a, b = actual[i], detected[j]
                if category == "effects":
                    if a["kind"] != UNKNOWN:
                        n["effectKinds"] += 1
                        n["hitEffectKind"] += a["kind"] == b["card"]
                    continue
                self.axes.append(differences(a, b))
                if a["health"] != UNKNOWN:
                    n["visibleHealth"] += 1
                    n["readHealth"] += b.get("health") not in (None, "unknown", UNKNOWN)
                    n["hitHealth"] += a["health"] == b.get("health")
                if a["kind"] == UNKNOWN:
                    continue
                n["identities"] += 1
                if b["kind"] in ("?", UNKNOWN, "unknown"):
                    n["unknown"] += 1
                elif b["kind"] != a["kind"]:
                    self.confusion[(a["kind"], b["kind"])] += 1
                else:
                    self.body_hits[a["kind"]] += 1
            if category == "objects":
                self.bodies.update(x["kind"] for x in actual if x["kind"] != UNKNOWN)
        plays = [p for p in label["opponentPlays"] if p["card"] != UNKNOWN]
        n["opponentPlays"] += len(plays)
        guesses = raw.get("opponentPlays", [])
        for card in {p["card"] for p in plays}:
            n["matchedPlays"] += len(
                pairs(
                    [p for p in plays if p["card"] == card],
                    [p for p in guesses if p["card"] == card],
                )
            )

    def report(self):
        n = self.n
        result = {
            "frames": n["frames"],
            "hand": rate(self.correct.total(), self.hand.total()),
            "nextCard": rate(n["hitNext"], n["next"]),
            "elixir": rate(self.mana_correct.total(), self.mana.total()),
            "nextByCard": {k: rate(self.next_hits[k], v) for k, v in self.next_cards.items()},
            "handByCard": {k: rate(self.correct[k], v) for k, v in sorted(self.hand.items())},
            "elixirByValue": {k: rate(self.mana_correct[k], self.mana[k]) for k in range(11)},
            "unknownRate": rate(n["unknown"], n["identities"]),
            "wrongClassRate": rate(self.confusion.total(), n["identities"]),
            "confusions": [[a, b, c] for (a, b), c in self.confusion.most_common()],
            "positionErrorTiles": {
                axis: {
                    "meanAbs": float(np.abs([r[i] for r in self.axes]).mean())
                    if self.axes
                    else None,
                    "signed": [round(r[i], 3) for r in self.axes],
                }
                for i, axis in enumerate(["x", "y"])
            },
            "healthSeenRate": rate(n["readHealth"], n["visibleHealth"]),
            "healthMatch": rate(n["hitHealth"], n["visibleHealth"]),
            "effectIdentity": rate(n["hitEffectKind"], n["effectKinds"]),
            "bodyRecallByKind": {k: rate(self.body_hits[k], v) for k, v in self.bodies.items()},
            "opponentPlayLabels": n["opponentPlays"],
            "playMissRate": rate(n["opponentPlays"] - n["matchedPlays"], n["opponentPlays"]),
        }
        for category, metric in [("objects", "missRate"), ("effects", "effectMissRate")]:
            result[metric] = rate(n[category] - n["matched" + category], n[category])
            result[category + "FalsePositives"] = {
                **rate(n["extras" + category], n["detected" + category]),
                "completeFrames": n["full" + category],
            }
        return result
