"""Bind champion, private-candidate or frozen-evaluation weights, and promote candidates."""

import json
import shutil
from pathlib import Path

import mlx.core as mx

from clash_bot.files import atomic_json
from clash_bot.qwen.adoption.promotion import parent_sha, publish
from clash_bot.qwen.learning.learner import Learner
from clash_bot.qwen.learning.learning_policy import FORMAT, FinalMLPLoRA, weights_digest


class AdapterRoles:
    def candidate_active(self):
        return self.learner.directory.resolve() != self.directory.resolve()

    def bind(self, learner):
        self.learner = learner
        self.model.language_model.model.norm.adapter = learner.adapter

    def status(self):
        champion = (
            self.evaluation_backup["metadata"]
            if self.evaluation_backup
            else getattr(self, "champion_learner", self.learner).metadata
        )
        return {
            **self.learner.metadata,
            "model": self.spec["name"],
            "weights_sha256": weights_digest(self.learner.adapter),
            "role": "evaluation"
            if self.evaluation_backup
            else "candidate_training"
            if self.candidate_active()
            else "champion",
            "champion_version": champion["version"],
            "champion_sha256": champion.get(
                "weights_sha256",
                weights_digest(getattr(self, "champion_learner", self.learner).adapter),
            ),
            "directory": str(self.learner.directory),
            "checkpoint": str(
                self.learner.directory / "checkpoints" / f"v{self.learner.metadata['version']:06d}"
            ),
        }

    def begin_candidate(self, directory):
        if self.evaluation_backup:
            raise ValueError("Frozen evaluation cannot switch to training")
        champion = getattr(self, "champion_learner", self.learner)
        self.champion_learner = champion
        root = Path(directory).resolve()
        allowed = self.directory.resolve().parents[1] / "arena/qwen"
        if not root.is_relative_to(allowed):
            raise ValueError("Training candidate must stay in the owned arena directory")
        parent = champion.metadata["weights_sha256"]
        if not (root / "current.json").exists():
            base = self.directory / "checkpoints" / f"v{champion.metadata['version']:06d}"
            destination = root / "checkpoints" / base.name
            shutil.copytree(base, destination, dirs_exist_ok=True)
            atomic_json(
                destination / "metadata.json",
                {
                    **champion.metadata,
                    "candidate_parent_sha256": parent,
                    "deployment_role": "candidate",
                },
            )
            atomic_json(
                root / "current.json",
                {"version": champion.metadata["version"], "weights_sha256": parent},
            )
        candidate = Learner(
            FinalMLPLoRA(self.spec["input_size"], self.spec["hidden_size"]),
            champion.norm_weight,
            champion.norm_eps,
            champion.token_rows,
            root,
            self.spec["identity"],
            champion.metadata["target"],
        )
        if parent_sha(candidate.metadata) != parent:
            raise ValueError("Training candidate was made against a stale champion")
        self.bind(candidate)
        return self.status()

    def end_candidate(self):
        if self.evaluation_backup:
            raise ValueError("Restore frozen evaluation before leaving training")
        self.bind(getattr(self, "champion_learner", self.learner))
        return self.status()

    def configure_candidate(self, version):
        if self.evaluation_backup or not self.candidate_active() or version != 3:
            raise ValueError("Only a private training candidate can select the fast controller")
        if self.learner.metadata.get("controller_version", 1) == version:
            return self.status()
        metadata = {
            **self.learner.metadata,
            "controller_version": version,
            "version": self.learner.metadata["version"] + 1,
            "warmup_base_datasets": len(self.learner.metadata.get("search_datasets", [])),
            "last_configuration": "compact public text + frozen feature replay",
        }
        self.learner.save(metadata)
        self.learner.metadata = metadata
        return self.status()

    def promote(self, request):
        if self.evaluation_backup or self.candidate_active():
            raise ValueError("Restore the champion before publishing")
        checkpoint = Path(request["checkpoint"]).resolve()
        if not checkpoint.is_relative_to(self.directory.resolve().parents[1] / "arena/qwen"):
            raise ValueError("Candidate checkpoint escaped the arena directory")
        metadata = json.loads((checkpoint / "metadata.json").read_text())
        if metadata["format"] != FORMAT or metadata["model_sha256"] != self.spec["identity"]:
            raise ValueError("Candidate belongs to another base model")
        fresh = FinalMLPLoRA(self.spec["input_size"], self.spec["hidden_size"])
        fresh.load_weights(str(checkpoint / "adapter.safetensors"), strict=True)
        mx.load(
            str(checkpoint / "optimizer.safetensors")
        )  # Verify readable optimizer before publication.
        result = publish(self.directory, checkpoint, request["report"], weights_digest(fresh))
        if result["promoted"]:
            old = self.learner
            self.champion_learner = Learner(
                FinalMLPLoRA(self.spec["input_size"], self.spec["hidden_size"]),
                old.norm_weight,
                old.norm_eps,
                old.token_rows,
                self.directory,
                self.spec["identity"],
                old.metadata["target"],
                frozen=True,
            )
            self.bind(self.champion_learner)
        return {**result, "champion": self.status()}

    def checkout(self, checkpoint=None):
        """Frozen A/B weights in one resident model, without moving current.json."""
        if self.candidate_active():
            raise ValueError("Leave candidate training before frozen evaluation")
        if checkpoint is None:
            if self.evaluation_backup:
                self.learner.adapter.load_weights(
                    str(self.evaluation_backup["path"] / "adapter.safetensors"), strict=True
                )
                self.learner.metadata = self.evaluation_backup["metadata"]
                self.evaluation_backup = None
            return {
                "restored": True,
                **self.learner.metadata,
                "weights_sha256": weights_digest(self.learner.adapter),
            }
        checkpoint = Path(checkpoint).resolve()
        metadata = json.loads((checkpoint / "metadata.json").read_text())
        if metadata["format"] != FORMAT or metadata["model_sha256"] != self.spec["identity"]:
            raise ValueError("Evaluation checkpoint belongs to another base model")
        fresh = FinalMLPLoRA(self.spec["input_size"], self.spec["hidden_size"])
        fresh.load_weights(str(checkpoint / "adapter.safetensors"), strict=True)
        if weights_digest(fresh) != metadata["weights_sha256"]:
            raise ValueError("Evaluation checkpoint checksum mismatch")
        if self.evaluation_backup is None:
            current = self.directory / "checkpoints" / f"v{self.learner.metadata['version']:06d}"
            if not current.exists():
                raise ValueError("Save a baseline checkpoint before frozen evaluation")
            self.evaluation_backup = {"path": current, "metadata": self.learner.metadata}
        from mlx.utils import tree_flatten, tree_unflatten

        self.learner.adapter.update(tree_unflatten(tree_flatten(fresh.trainable_parameters())))
        self.learner.metadata = metadata
        return {
            "readOnly": True,
            "checkpoint": str(checkpoint),
            "version": metadata["version"],
            "weights_sha256": weights_digest(self.learner.adapter),
        }
