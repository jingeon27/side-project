"""Replay the frozen visual encoder and read the four trophy hand slots and elixir bar."""

import hashlib
import json

import numpy as np
from PIL import Image

from clash_bot.paths import CONTRACTS_DIR, DATA_DIR
from clash_bot.perception.labels.schema import CATALOGUE, UNKNOWN

SCREEN = json.loads((CONTRACTS_DIR / "trophy-screen.json").read_bytes())
DETECTOR = DATA_DIR / "counterpush/detector"
REFERENCES = DATA_DIR / "trophy/current/references"


def checksum(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def references(directory):
    manifest = json.loads((directory / "manifest.json").read_bytes())
    if manifest["format"] != "android-reviewed-hand-and-field-v2":
        raise ValueError("Unsupported hand references")
    for item in manifest["references"]:
        path = (directory / item["image"]).resolve()
        if (
            path.parent != directory.resolve()
            or checksum(path) != item["sha256"]
            or item["card"] not in CATALOGUE["cards"]
        ):
            raise ValueError("Invalid hand reference")
        yield item["card"], path


def artifacts(detector, reference):
    names = [
        "crop-classifier.onnx",
        "crop-export.json",
        "crop-classes.json",
        "units_M_480x352.onnx",
    ]
    files = [detector / n for n in names]
    files += [
        p
        for p in sorted(detector.iterdir())
        if p.name in {"graveyard-marker.png", "atlas.json", "atlas.npz"}
        or p.match("red-11*.png")
        or p.match("blue-11*.png")
    ]
    clock = json.loads((reference / "clock-reference.json").read_bytes())
    path = (reference / clock["image"]).resolve()
    if path.parent != reference.resolve() or checksum(path) != clock["sha256"]:
        raise ValueError("Invalid clock reference")
    files.extend([reference / "manifest.json", reference / "clock-reference.json", path])
    files.extend(p for _, p in references(reference))
    return sorted(set(files))


def identity(detector, reference):
    from clash_bot.paths import AGENT_DIR

    code = sorted(
        p
        for p in (AGENT_DIR / "python/clash_bot/perception").rglob("*.py")
        if not p.name.endswith(("_test.py", "_fixture.py"))
    )
    files = [
        *artifacts(detector, reference),
        CONTRACTS_DIR / "trophy-screen.json",
        CONTRACTS_DIR / "card-catalogue.json",
        *code,
    ]
    proof = [
        (
            str(p.relative_to(AGENT_DIR))
            if p.is_relative_to(AGENT_DIR)
            else p.parent.name + "/" + p.name,
            checksum(p),
        )
        for p in files
    ]
    return hashlib.sha256(json.dumps(proof, separators=(",", ":")).encode()).hexdigest()


def embedding(session, crops):
    data = (
        np.asarray(
            [np.asarray(im.convert("RGB").resize((112, 112)), dtype=np.float32) for im in crops]
        )
        / 255
    )
    data = (
        ((data - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225])
        .transpose(0, 3, 1, 2)
        .astype(np.float32)
    )
    features = session.run([session.get_outputs()[1].name], {"images": data})[0]
    if features.shape != (len(crops), 384):
        raise ValueError("Expected frozen 384-dimensional visual features")
    return features / np.maximum(np.linalg.norm(features, axis=1, keepdims=True), 1e-9)


def fingerprint(im):
    return np.asarray(
        im.convert("RGB").resize((18, 22), Image.Resampling.BILINEAR), dtype=np.float32
    )


def hand_card(crop, refs):
    image = fingerprint(crop)
    scores = sorted(
        (min(float(np.abs(image - f).mean()) for f in samples), card)
        for card, samples in refs.items()
    )
    if len(scores) < 2 or scores[0][0] > 29 or scores[1][0] - scores[0][0] < 3:
        return UNKNOWN
    return scores[0][1]


def elixir(im, candidate=False):
    left, top, right, bottom = SCREEN["elixirBar" if candidate else "referenceElixirBar"]
    pixels = np.asarray(im.crop((left, top + 2, right, bottom - 2)), dtype=float)
    r, g, b = pixels.transpose(2, 0, 1)
    filled = ((r > 100) & (b > 90) & (r > g * 1.35) & (b > g * 1.2)).mean(axis=0) >= 0.4
    if not candidate:
        end = next(
            (i for i, v in enumerate(filled) if not v and filled[i : i + 7].sum() < 2), len(filled)
        )
        if (filled == (np.arange(len(filled)) < end)).mean() < 0.85:
            return UNKNOWN
        return int(min(10, 10 * end / len(filled)))
    # The integer is over the first cell; a bright transition stripe can interrupt the
    # purple band at the far end. Read its endpoint instead of stopping at that stripe.
    present = np.flatnonzero(filled)
    end = int(present[-1] + 1) if len(present) else 0
    interior = filled[20 : max(20, end - 9)]
    if len(interior) and interior.mean() < 0.78:
        return UNKNOWN
    return min(10, int(np.floor(10 * end / len(filled) + 0.5)))


class Reader:
    def __init__(self, detector=DETECTOR, reference=REFERENCES):
        from clash_bot.perception.trophy_vision import TrophyVision

        self.fingerprint = identity(detector, reference)
        self.vision = TrophyVision(detector, reference)
        self.refs = {}
        art = []
        self.ref_cards = []
        for card, path in references(reference):
            with Image.open(path) as im:
                self.refs.setdefault(card, []).append(fingerprint(im))
                art.append(im.convert("RGB"))
                self.ref_cards.append(card)
        self.art = embedding(self.vision.worker.classifier, art)

    def next_card(self, image):
        crop = image.crop(SCREEN["next"])
        guess = hand_card(crop, self.refs)
        if guess != UNKNOWN:
            return guess
        vector = embedding(self.vision.worker.classifier, [crop])[0]
        scores = {}
        for card, score in zip(self.ref_cards, self.art @ vector):
            scores[card] = max(scores.get(card, -1), float(score))
        ranked = sorted(scores, key=scores.get, reverse=True)
        return (
            ranked[0]
            if len(ranked) > 1
            and scores[ranked[0]] > 0.65
            and scores[ranked[0]] - scores[ranked[1]] > 0.025
            else UNKNOWN
        )

    def features(self, image):
        return embedding(self.vision.worker.classifier, [image.crop(box) for box in SCREEN["hand"]])

    def observe(self, image, field, head=None):
        hand = [hand_card(image.crop(box), self.refs) for box in SCREEN["hand"]]
        if head is not None:
            hand = head.predict(self.features(image))
        next_card = (
            self.next_card(image)
            if head is not None
            else hand_card(image.crop(SCREEN["referenceNext"]), self.refs)
        )
        return {
            **field,
            "hand": hand,
            "nextCard": next_card,
            "elixir": elixir(image, head is not None),
        }
