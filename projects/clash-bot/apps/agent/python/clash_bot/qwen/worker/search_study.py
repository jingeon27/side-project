"""Distill native search targets into a private candidate, never the deployed champion."""

import shutil

import mlx.core as mx

from clash_bot.files import atomic_json
from clash_bot.qwen.learning.learner import Learner
from clash_bot.qwen.learning.learning_policy import FinalMLPLoRA, weights_digest
from clash_bot.qwen.learning.training_budget import training_work
from clash_bot.qwen.records.replay import rehearse, remember
from clash_bot.qwen.records.search_data import load_search_targets


class SearchStudy:
    def study(self, request):
        if self.evaluation_backup:
            raise ValueError("Frozen evaluation cannot train")
        dataset, identity, path = load_search_targets(request["dataset"])
        if request.get("candidate"):
            if not self.candidate_active():
                raise ValueError("Search training requires a private candidate")
            report = self.distill_dataset(dataset, identity, path)
            return {
                **report,
                "candidate_checkpoint": self.status()["checkpoint"],
                "candidate_sha256": weights_digest(self.learner.adapter),
                "deployed": False,
                "baseline_sha256": getattr(self, "champion_learner", self.learner).metadata[
                    "weights_sha256"
                ],
            }
        if self.candidate_active():
            raise ValueError("Use candidate search training in the private context")
        original = self.learner
        parent = weights_digest(original.adapter)
        root = (
            self.directory.parents[1] / "arena/qwen/candidates" / f"{identity[:16]}-{parent[:12]}"
        )
        if not (root / "current.json").exists():
            base = self.directory / "checkpoints" / f"v{original.metadata['version']:06d}"
            if not base.exists():
                raise ValueError("Search study requires a saved real-play baseline")
            destination = root / "checkpoints" / base.name
            shutil.copytree(base, destination, dirs_exist_ok=True)
            atomic_json(
                destination / "metadata.json",
                {**original.metadata, "study_parent": parent, "study_rules_id": dataset["rulesID"]},
            )
            atomic_json(
                root / "current.json",
                {"version": original.metadata["version"], "weights_sha256": parent},
            )
        candidate = Learner(
            FinalMLPLoRA(self.spec["input_size"], self.spec["hidden_size"]),
            original.norm_weight,
            original.norm_eps,
            original.token_rows,
            root,
            self.spec["identity"],
            original.metadata["target"],
        )
        self.learner = candidate
        self.model.language_model.model.norm.adapter = candidate.adapter
        try:
            if dataset.get("controllerVersion") == 3:
                self.configure_candidate(3)
            if identity in candidate.metadata.get("search_datasets", []):
                report = {
                    "updated": False,
                    "reason": "already_trained",
                    "version": candidate.metadata["version"],
                }
            else:
                report = self.distill_dataset(dataset, identity, path)
            checkpoint = root / "checkpoints" / f"v{candidate.metadata['version']:06d}"
            result = {
                **report,
                "candidate_checkpoint": str(checkpoint),
                "baseline_sha256": parent,
                "candidate_sha256": weights_digest(candidate.adapter),
                "dataset": str(path),
                "model": self.spec["name"],
                "deployed": False,
            }
            atomic_json(root / "study.json", result)
            return result
        finally:
            self.learner = original
            self.model.language_model.model.norm.adapter = original.adapter
            if weights_digest(original.adapter) != parent:
                raise RuntimeError("Isolated study modified the active adapter")

    def distill_dataset(self, dataset, identity, path):
        if identity in self.learner.metadata.get("search_datasets", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        samples = []
        for row in dataset["samples"]:
            with training_work():
                feature = self.learner.directory / "features" / identity / f"{len(samples):03d}.npz"
                behavior = self.choose(
                    {
                        "images": [str(path.parent / row["image"])],
                        "prompt": row["prompt"],
                        "choices": row["choices"],
                        "feature_path": str(feature),
                        "controller_version": row.get("controllerVersion", 1),
                    }
                )["behavior"]
                samples.append(
                    {
                        **mx.load(str(feature)),
                        "labels": behavior["labels"],
                        "version": behavior["version"],
                        "old_log_probs": mx.array(behavior["old_log_probs"]),
                        "search_target": row["target"],
                    }
                )
                # Search targets supervise the raw head; their KL anchor is not
                # the mechanics-adjusted categorical behavior distribution.
                samples[-1]["old_log_probs"] = mx.stop_gradient(self.learner.log_probs(samples[-1]))
        report = self.learner.distill_search(
            samples, identity, dataset["rulesID"], epochs=dataset.get("trainingEpochs", 1)
        )
        remember(self.learner, dataset, identity, samples)
        if report.get("updated") and dataset.get("controllerVersion") == 3:
            atomic_json(
                self.learner.directory / "actor-anchors.json",
                {
                    "version": 2,
                    "samples": [
                        {
                            "path": str(
                                self.learner.directory / "features" / identity / f"{index:03d}.npz"
                            ),
                            "labels": sample["labels"],
                            "search_target": sample["search_target"],
                        }
                        for index, sample in enumerate(samples)
                    ],
                },
            )
        return report

    def rehearse(self, request):
        if self.evaluation_backup or not self.candidate_active():
            raise ValueError("Replay requires a private training candidate")
        return rehearse(self.learner, request.get("rounds", 4))
