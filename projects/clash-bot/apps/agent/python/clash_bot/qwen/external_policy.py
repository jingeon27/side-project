"""Read-only Android policy snapshots sharing the resident frozen backbone."""

import json
from pathlib import Path

from clash_bot.qwen.learning_policy import FORMAT, FinalMLPLoRA, Learner, weights_digest


def choose_external(worker, request):
    if worker.evaluation_backup or not worker.candidate_active():
        raise ValueError("External inference is unavailable during qualification")
    checkpoint = Path(request["checkpoint"]).resolve(strict=True)
    allowed = worker.directory.resolve().parents[1] / "arena/qwen/training"
    if not checkpoint.is_relative_to(allowed) or checkpoint.parent.name != "checkpoints":
        raise ValueError("External snapshot must be an owned private checkpoint")
    if request.get("controller_version") != 3:
        raise ValueError("External inference requires the text controller")
    cached = getattr(worker, "external_policy", None)
    if cached is None or cached["path"] != checkpoint:
        metadata = json.loads((checkpoint / "metadata.json").read_text())
        if (
            metadata["format"] != FORMAT
            or metadata["model_sha256"] != worker.spec["identity"]
            or metadata.get("controller_version") != 3
        ):
            raise ValueError("External snapshot has an incompatible policy")
        original = worker.learner
        adapter = FinalMLPLoRA(worker.spec["input_size"], worker.spec["hidden_size"])
        adapter.load_weights(str(checkpoint / "adapter.safetensors"), strict=True)
        if weights_digest(adapter) != metadata["weights_sha256"]:
            raise ValueError("External snapshot checksum mismatch")
        # No current.json lives inside an immutable checkpoint. This learner is
        # only exposed through choose(), never a training or save operation.
        learner = Learner(
            adapter,
            original.norm_weight,
            original.norm_eps,
            original.token_rows,
            checkpoint,
            worker.spec["identity"],
            metadata["target"],
        )
        learner.metadata = metadata
        worker.external_policy = {"path": checkpoint, "learner": learner}
    original = worker.learner
    try:
        worker.bind(worker.external_policy["learner"])
        result = worker.choose(request)
        result["behavior"].update(
            {
                "trainable": False,
                "read_only_external": True,
                "external_checkpoint": str(checkpoint),
                "source": "bluestacks_trophy",
            }
        )
        return result
    finally:
        worker.bind(original)
