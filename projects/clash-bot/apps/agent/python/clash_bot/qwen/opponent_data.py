"""Validate visual demonstrations independently of the browser and game inputs."""

import hashlib
import json
import math
from pathlib import Path

from .decision_input import CONTRACT, mirror_actor_prompt
from .episode_events import verified_result

DEMONSTRATION_FORMAT = "counterpush-mirror-actor-demonstrations-v3"


def load_demonstrations(path, quarantine_path=None):
    path = Path(path).resolve()
    raw = path.read_bytes()
    dataset = json.loads(raw)
    if (
        dataset.get("format") != DEMONSTRATION_FORMAT
        or dataset.get("source") != "counterpush_live_screen"
    ):
        raise ValueError("Unsupported opponent demonstration source")
    expected_deck = {name for name, code in CONTRACT["codes"].items() if code.isupper()}
    if len(dataset["deck"]) != 8 or set(dataset["deck"]) != expected_deck:
        raise ValueError("Mirror teacher must use the same fixed deck")
    result = dataset["teacher_result"]
    if not verified_result(result) or result["red"] <= result["blue"]:
        raise ValueError("Mirror teacher must be the verified winner")
    samples = dataset.get("samples", [])
    if not isinstance(samples, list) or not 1 <= len(samples) <= 24:
        raise ValueError("Expected 1 to 24 visually verified demonstrations")
    if len({sample["id"] for sample in samples}) != len(samples):
        raise ValueError("Duplicate demonstration IDs")
    blocked = set()
    if quarantine_path is not None and Path(quarantine_path).exists():
        quarantine = json.loads(Path(quarantine_path).read_text())
        if quarantine.get("version") != 1 or not isinstance(quarantine.get("entries"), list):
            raise ValueError("Invalid demonstration quarantine")
        blocked = {(entry["card"], entry["before_sha256"]) for entry in quarantine["entries"]}
    for sample in samples:
        if (sample["card"], sample["source_before_sha256"]) in blocked:
            raise ValueError("Quarantined demonstration; re-prepare the dataset: " + sample["id"])
        if (
            sample.get("actor") != "red_top"
            or sample.get("verified_actor") is not True
            or sample.get("absent_before") is not True
        ):
            raise ValueError("Opponent action was not visually verified")
        confidence = sample.get("confidence", 0)
        if (
            not isinstance(confidence, (int, float))
            or not math.isfinite(confidence)
            or not 0.9 <= confidence <= 1
        ):
            raise ValueError("Low demonstration confidence")
        if (
            sample.get("hand") is not None
            or sample.get("elixir") is not None
            or sample.get("exact_target") is not None
        ):
            raise ValueError("Hidden opponent state must remain unknown")
        if sample.get("evidence") not in ("new_unit_visible", "spell_effect_visible"):
            raise ValueError("Missing visual action evidence")
        if not isinstance(sample.get("situation"), dict):
            raise ValueError("Demonstration needs the tracked before situation")
        gap = (sample["after_at"] - sample["before_at"]) / 1000
        if not 0 < gap <= 10:
            raise ValueError("Ambiguous opponent action time window")
        choices, targets = sample["choices"], sample["target_ids"]
        if (
            not 2 <= len(choices) <= 26
            or len(set(choices)) != len(choices)
            or not targets
            or not set(targets).issubset(choices)
        ):
            raise ValueError("Invalid demonstration action labels")
        candidates = {candidate["id"]: candidate for candidate in sample["candidates"]}
        if sample["prompt"] != mirror_actor_prompt(sample):
            raise ValueError("Mirror prompt disagrees with public BEFORE facts")
        region = sample["target_region"]
        positional = sample["label_kind"] == "placement_region"
        if sample["label_kind"] not in ("placement_region", "card_lane"):
            raise ValueError("Unknown mirror supervision")
        if positional:
            grounding = sample["grounding"]
            radius = max(
                24,
                min(
                    45,
                    max(
                        grounding["box"][2] - grounding["box"][0],
                        grounding["box"][3] - grounding["box"][1],
                    )
                    * 0.35,
                ),
            )
            if sample["card"] not in ("poison", "graveyard", "goblin_hut") or region != {
                "x": grounding["x"],
                "y": 2 * sample["river_y"] - grounding["y"],
                "radius": radius,
            }:
                raise ValueError("Placement region is not the observed stationary effect/building")
        elif region is not None:
            raise ValueError("Card/lane supervision cannot claim a precise region")
        expected = []
        for choice in choices:
            candidate = candidates[choice]
            x = candidate["target"]["x"]
            lane = "left" if x < 184 else "right" if x > 184 else "center"
            matches = (
                math.hypot(x - region["x"], candidate["target"]["y"] - region["y"])
                <= region["radius"]
                if positional
                else lane == sample["lane"]
            )
            if candidate["card"] == sample["card"] and matches:
                expected.append(choice)
        if set(targets) != set(expected):
            raise ValueError("Target label disagrees with observed card, lane or placement region")
        for image_key, hash_key in (
            ("image", "image_sha256"),
            ("evidence_image", "evidence_sha256"),
        ):
            image = (path.parent / sample[image_key]).resolve()
            if not image.is_relative_to(path.parent / "images"):
                raise ValueError("Demonstration image escaped the dataset directory")
            if hashlib.sha256(image.read_bytes()).hexdigest() != sample[hash_key]:
                raise ValueError("Demonstration image checksum mismatch")
    return dataset, hashlib.sha256(raw).hexdigest(), path
