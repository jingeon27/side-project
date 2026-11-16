"""Read verified, on-policy episode evidence without owning the live model."""

import json
from pathlib import Path

import mlx.core as mx

from .learning_policy import FORMAT, MODEL_SHA256, weights_digest
from .qualification import RESULT_LABEL


def verified_result(row):
    if row.get("type") != "result":
        return False
    if row.get("source") == "crown_pixels_verified2":
        return True
    if row.get("source") != "counterpush_result_dom_verified2":
        return False
    readings = row.get("readings", [])
    if len(readings) != 2 or readings[0] != readings[1] or not isinstance(readings[0], str):
        return False
    match = RESULT_LABEL.fullmatch(readings[0])
    return match is not None and [int(match[1]), int(match[2])] == [row.get("blue"), row.get("red")]


def confirmed_input(row):
    if row.get("type") == "ability_check":
        return (
            row.get("confirmed") is True
            and row.get("changed") is True
            and row.get("handUnchanged") is True
            and row.get("expectedCost") == 2
            and row.get("action", {}).get("kind") == "ability"
            and row.get("action", {}).get("card") == "ice_wizard"
        )
    if row.get("type") != "input_check":
        return False
    # Counterpush records explicit confirmation after the spend animation has
    # settled. Legacy Android episodes retain their hand-change/spend contract.
    if "confirmed" in row:
        return row["confirmed"] is True and row.get("changed") is True
    return row.get("changed") is True and row.get("spent", 0) >= 1


def episode_samples(episode, learner, spec):
    directory = Path(episode).resolve()
    rows = [
        json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines() if line
    ]
    if any(
        row.get("type") == "input_recovery" or row.get("behavior", {}).get("read_only_external")
        for row in rows
    ):
        return None
    results = [row for row in rows if verified_result(row)]
    if not results:
        return None
    result = results[-1]
    blue, red = result["blue"], result["red"]
    if not all(isinstance(value, int) and 0 <= value <= 3 for value in (blue, red)):
        raise ValueError("Invalid crown result")
    reward = (blue > red) - (blue < red)
    confirmed = {
        int(row["frame"])
        for row in rows
        if confirmed_input(row) or (row.get("type") == "wait_check" and row.get("valid") is True)
    }
    decisions = [
        row
        for row in rows
        if row.get("type") == "prediction"
        and row.get("behavior", {}).get("format") == FORMAT
        and row["behavior"].get("trainable")
        and Path(row["image"]).stem.isdigit()
        and int(Path(row["image"]).stem) in confirmed
    ]
    samples = []
    for index, decision in enumerate(decisions):
        behavior = decision["behavior"]
        if behavior.get("model_identity", MODEL_SHA256) != spec["identity"]:
            raise ValueError("Episode belongs to a different base model")
        feature_path = Path(behavior["feature_path"]).resolve()
        if feature_path.parent != directory / "features":
            raise ValueError("Feature file escaped the episode directory")
        feature = mx.load(str(feature_path))
        if feature["features"].shape != (spec["input_size"],) or feature["base"].shape != (
            spec["hidden_size"],
        ):
            raise ValueError("Invalid frozen Qwen feature shape")
        sample = {
            **feature,
            "labels": behavior["labels"],
            "chosen": behavior["chosen"],
            "old_log_probs": mx.array(behavior["old_log_probs"]),
            "version": behavior["version"],
            "remaining": len(decisions) - index - 1,
        }
        if behavior["adapter_sha256"] != weights_digest(learner.adapter):
            raise ValueError("Episode adapter checksum does not match current policy")
        samples.append(sample)
    return {"samples": samples, "reward": reward, "episode": str(directory)}
