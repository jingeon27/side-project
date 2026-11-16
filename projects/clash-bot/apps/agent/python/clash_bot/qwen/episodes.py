"""Read verified, on-policy episode evidence without owning the live model."""

import json
from pathlib import Path

import mlx.core as mx

from .episode_events import confirmed_input, confirmed_wait, verified_result
from .learning_policy import FORMAT, weights_digest


def episode_samples(episode, learner, spec):
    directory = Path(episode).resolve()
    rows = [
        json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines() if line
    ]
    if any(row.get("type") == "input_recovery" for row in rows):
        return None
    results = [row for row in rows if verified_result(row)]
    if not results:
        return None
    result = results[-1]
    blue, red = result["blue"], result["red"]
    if not all(isinstance(value, int) and 0 <= value <= 3 for value in (blue, red)):
        raise ValueError("Invalid crown result")
    reward = (blue > red) - (blue < red)
    confirmed = {int(row["frame"]) for row in rows if confirmed_input(row) or confirmed_wait(row)}
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
        if behavior["model_identity"] != spec["identity"]:
            raise ValueError("Episode belongs to a different base model")
        feature_path = Path(behavior["feature_path"]).resolve()
        if feature_path.parent != directory / "features":
            raise ValueError("Feature file escaped the episode directory")
        feature = mx.load(str(feature_path))
        if feature["features"].shape != (spec["input_size"],) or feature["base"].shape != (
            spec["hidden_size"],
        ):
            raise ValueError("Invalid frozen Qwen feature shape")
        if (
            feature["policy_bias"].shape != (len(behavior["labels"]),)
            or not mx.array_equal(feature["policy_bias"], mx.array(behavior["policy_bias"])).item()
        ):
            raise ValueError("Saved policy prior does not match executed behavior")
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
