"""JSON-lines CPU learner. Publication belongs to the independent Trophy evaluator."""

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, TypeAdapter

from clash_bot.files import atomic_json
from clash_bot.perception.protocol import protocol_channel

from .learner import load_weights, save_checkpoint, train
from .protocol import Episode, Snapshot, Strict


class Initialize(Strict):
    op: Literal["initialize"]
    seed: str
    behaviorSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Train(Strict):
    op: Literal["train"]
    policy: Snapshot
    episodes: list[str] = Field(min_length=1, max_length=16)
    behaviorSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")
    championParentSHA256: str = Field(pattern=r"^[a-f0-9]{64}$")


REQUEST = TypeAdapter(Annotated[Initialize | Train, Field(discriminator="op")])


def within(root, path):
    resolved = Path(path).resolve()
    if not resolved.is_relative_to(root):
        raise ValueError("Trophy training may only read its own experiment artifacts")
    return resolved


def verified_episode(root, path):
    path = within(root, path)
    episode = Episode.model_validate_json(path.read_text())
    for image in [*episode.resultEvidence, *episode.transitions]:
        name = image.image
        expected = image.sha256 if hasattr(image, "sha256") else image.imageSHA256
        actual = hashlib.sha256(within(root, path.parent / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("Own trajectory screenshot evidence changed")
    return episode


class Worker:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def handle(self, request):
        if request.op == "initialize":
            path = self.root / "seed.json"
            if path.exists():
                value = json.loads(path.read_text())
                if value["behaviorSHA256"] != request.behaviorSHA256:
                    raise ValueError("Experiment behavior changed")
                load_weights(value["snapshot"]["checkpoint"])
                return value["snapshot"]
            weights = load_weights(request.seed)
            from clash_bot.arena.policy.features import checksum

            snapshot = save_checkpoint(
                self.root,
                weights,
                0,
                request.behaviorSHA256,
                checksum(weights),
                {"type": "unqualified_seed", "sourcePolicy": request.seed},
            )
            atomic_json(path, {"behaviorSHA256": request.behaviorSHA256, "snapshot": snapshot})
            return snapshot
        if request.op != "train":
            raise ValueError("Unsupported learner operation")
        episodes = [verified_episode(self.root, path) for path in request.episodes]
        digest = hashlib.sha256(
            json.dumps(
                {
                    "episodes": [
                        hashlib.sha256(Path(path).read_bytes()).hexdigest()
                        for path in request.episodes
                    ],
                    "before": request.policy.weightsSHA256,
                    "behavior": request.behaviorSHA256,
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        receipt_path = self.root / "updates" / f"{digest}.json"
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            load_weights(receipt["snapshot"]["checkpoint"])
            return receipt
        # Recover a completed immutable checkpoint if the process stopped before
        # its update receipt was linked. Do not apply the same PPO batch twice.
        next_directory = self.root / "checkpoints" / f"v{request.policy.version + 1:06}"
        if (next_directory / "metadata.json").exists():
            metadata = json.loads((next_directory / "metadata.json").read_text())
            receipt = metadata["receipt"]
            if (
                receipt.get("id") != digest
                or receipt.get("before") != request.policy.model_dump()
                or metadata["behaviorSHA256"] != request.behaviorSHA256
                or metadata["championParentSHA256"] != request.championParentSHA256
            ):
                raise ValueError("Unrelated immutable checkpoint occupies the next version")
            from clash_bot.arena.policy.features import checksum

            actual = checksum(load_weights(next_directory / "policy.json"))
            if actual != metadata["weightsSHA256"]:
                raise ValueError("Recovered checkpoint changed")
            receipt["snapshot"] = {
                "checkpoint": str(next_directory / "policy.json"),
                "version": metadata["version"],
                "weightsSHA256": actual,
            }
            atomic_json(receipt_path, receipt)
            return receipt
        checkpoint = within(self.root, request.policy.checkpoint)
        weights = load_weights(checkpoint)
        from clash_bot.arena.policy.features import checksum

        if checksum(weights) != request.policy.weightsSHA256:
            raise ValueError("Requested collection checkpoint changed")
        started = time.monotonic()
        candidate, report = train(weights, episodes, request.behaviorSHA256)
        receipt = {
            "format": "trophy-own-ppo-update-v1",
            "id": digest,
            "before": request.policy.model_dump(),
            "episodes": [episode.id for episode in episodes],
            "report": report,
            "elapsedMs": round((time.monotonic() - started) * 1000),
        }
        snapshot = request.policy.model_dump()
        if report["updated"]:
            snapshot = save_checkpoint(
                self.root,
                candidate,
                request.policy.version + 1,
                request.behaviorSHA256,
                request.championParentSHA256,
                receipt,
            )
        receipt["snapshot"] = snapshot
        atomic_json(receipt_path, receipt)
        return receipt


def main():
    if len(sys.argv) != 2:
        raise ValueError("Provide the owned Trophy experiment directory")
    emit = protocol_channel()
    worker = Worker(sys.argv[1])
    emit({"type": "ready", "format": "trophy-own-policy-learning-v1"})
    for line in sys.stdin:
        try:
            request = REQUEST.validate_json(line)
            emit({"type": "result", **worker.handle(request)})
        except (ValueError, OSError) as error:
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
