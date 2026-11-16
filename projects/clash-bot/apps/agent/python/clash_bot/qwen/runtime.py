"""Own one resident Qwen backbone, private learners and frozen evaluations."""

import json
import secrets
import shutil
from pathlib import Path

import mlx.core as mx
from mlx_vlm import load
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import prepare_inputs

from clash_bot.files import atomic_json
from clash_bot.qwen.decision_input import CONTRACT, mirror_actor_prompt
from clash_bot.qwen.feature_cache import FeatureCache
from clash_bot.qwen.learning_policy import (
    FORMAT,
    FinalMLPLoRA,
    Learner,
    weights_digest,
)
from clash_bot.qwen.model_specs import MODEL, require_model_directory, verify_model
from clash_bot.qwen.opponent_data import load_demonstrations
from clash_bot.qwen.promotion import parent_sha, publish
from clash_bot.qwen.replay import rehearse, remember
from clash_bot.qwen.search_data import load_search_targets

from .episodes import episode_samples
from .features import AdaptedFinalNorm, Capture, output_token_rows


class LearningWorker:
    def __init__(self, model_path, directory):
        require_model_directory(model_path)
        self.spec = MODEL
        mx.set_cache_limit(256 * 1024 * 1024)
        mx.set_memory_limit(self.spec["memory_gib"] * 1024**3)
        mx.random.seed(secrets.randbits(32))
        verify_model(model_path, self.spec)
        self.model, self.processor = load(model_path, trust_remote_code=False)
        config = self.model.config.text_config
        if (
            config.hidden_size != self.spec["hidden_size"]
            or config.intermediate_size != self.spec["input_size"]
            or config.num_hidden_layers != self.spec["layers"]
            or config.tie_word_embeddings
        ):
            raise ValueError("Model architecture does not match the pinned specification")
        self.model.freeze()
        self.model.eval()
        self.sink = {}
        core = self.model.language_model.model
        core.layers[-1].mlp.down_proj = Capture(
            core.layers[-1].mlp.down_proj, self.sink, "features"
        )
        norm = core.norm
        self.tokens = [
            self.processor.tokenizer.encode(chr(65 + i), add_special_tokens=False)
            for i in range(26)
        ]
        if any(len(token) != 1 for token in self.tokens):
            raise ValueError("Action labels must encode as one Qwen token")
        token_ids = mx.array([token[0] for token in self.tokens])
        token_rows = output_token_rows(self.model.language_model, token_ids)
        mx.eval(token_rows)
        self.learner = Learner(
            FinalMLPLoRA(config.intermediate_size, config.hidden_size),
            norm.weight,
            config.rms_norm_eps,
            token_rows,
            directory,
            self.spec["identity"],
            f"language_model.model.layers.{config.num_hidden_layers - 1}.mlp.down_proj",
            frozen=True,
        )
        core.norm = AdaptedFinalNorm(norm, self.learner.adapter, self.sink)
        self.directory = Path(directory)
        self.evaluation_backup = None
        self.champion_learner = self.learner
        self.feature_cache = FeatureCache(
            self.directory.parents[1] / "qwen/feature-cache",
            self.spec["input_size"],
            self.spec["hidden_size"],
        )

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

    def choose(self, request):
        controller = self.learner.metadata.get("controller_version", 1)
        if request["controller_version"] != controller:
            raise ValueError("Decision controller does not match the frozen policy")
        choices = request["choices"]
        if not 1 <= len(choices) <= 26 or len(set(choices)) != len(choices):
            raise ValueError("Invalid legal action list")
        version = self.learner.metadata["version"]
        if len(choices) == 1:
            return {
                "choice": choices[0],
                "behavior": {
                    "format": FORMAT,
                    "version": version,
                    "model_identity": self.spec["identity"],
                    "model": self.spec["name"],
                    "trainable": False,
                    "reason": "single_legal_action",
                    "read_only_evaluation": self.evaluation_backup is not None,
                    "selection": "categorical_as_live",
                    "controller_version": controller,
                    "adapter_sha256": weights_digest(self.learner.adapter),
                },
            }
        text_only = controller >= 3
        prompt = apply_chat_template(
            self.processor,
            self.model.config,
            request["prompt"],
            num_images=0 if text_only else 1,
            enable_thinking=False,
        )
        key = (
            self.feature_cache.key(self.spec["identity"], prompt, controller) if text_only else None
        )
        cached = self.feature_cache.get(key) if key and not request.get("cache_bypass") else None
        if cached is None:
            inputs = prepare_inputs(
                self.processor,
                images=[] if text_only else request["images"],
                prompts=prompt,
                image_token_index=self.model.config.image_token_index,
            )
            token_ids = inputs.pop("input_ids")
            pixels = inputs.pop("pixel_values", None)
            mask = inputs.pop("attention_mask", None)
            embeddings = self.model.get_input_embeddings(token_ids, pixels, mask=mask, **inputs)
            output = self.model.language_model(
                token_ids, mask=mask, **embeddings.to_dict(), skip_logits=True, return_hidden=True
            )
            features = mx.stop_gradient(self.sink["features"].astype(mx.float32))
            base = mx.stop_gradient(self.sink["base"].astype(mx.float32))
            mx.eval(features, base)
            if key:
                self.feature_cache.put(key, {"features": features, "base": base})
        else:
            features, base = cached["features"], cached["base"]
        sample = {"features": features, "base": base, "labels": list(range(len(choices)))}
        # Score the hidden state returned by the adapted Qwen itself. Training uses
        # the equivalent cached-feature computation to avoid a full-model backward.
        if text_only:
            log_probs = self.learner.log_probs(sample)
        else:
            hidden = output.hidden_states[-1][0, -1]
            logits = (
                hidden @ self.learner.token_rows[mx.array(sample["labels"])].astype(mx.float32).T
            )
            log_probs = logits - mx.logsumexp(logits)
        # Frozen evaluation uses the same categorical action policy as live
        # play; freezing prevents learning, not stochastic action sampling.
        chosen = int(mx.random.categorical(log_probs).item())
        mx.eval(features, base, log_probs)
        destination = Path(request["feature_path"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        mx.savez(str(destination), features=features, base=base)
        return {
            "choice": choices[chosen],
            "behavior": {
                "format": FORMAT,
                "version": version,
                "model_identity": self.spec["identity"],
                "model": self.spec["name"],
                "trainable": self.evaluation_backup is None and self.candidate_active(),
                "read_only_evaluation": self.evaluation_backup is not None,
                "selection": "categorical_as_live",
                "controller_version": controller,
                "choices": choices,
                "chosen": chosen,
                "labels": sample["labels"],
                "old_log_probs": log_probs.tolist(),
                "feature_path": str(destination),
                "adapter_applied_inside_qwen": cached is None,
                "feature_cache_hit": cached is not None,
                "policy_input": "public_text_v3" if text_only else "image_and_text",
                "adapter_sha256": weights_digest(self.learner.adapter),
            },
        }

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

    def warmup(self):
        if (
            self.evaluation_backup
            or not self.candidate_active()
            or self.learner.metadata.get("controller_version") != 3
        ):
            raise ValueError("Warmup requires the private fast controller")
        if getattr(self, "fast_warmed", False):
            return {"warmed": True, "already_warm": True, "training_samples_added": 0}
        before = weights_digest(self.learner.adapter)
        prompt = (
            CONTRACT["header"]
            + "mana=10;enemyMana=0-10;hand=KIFG;next=P;own=;enemy=;effects=;skill=0\n"
        )
        # Exercise the actual frozen backbone before starting a timed match.
        # These synthetic warmup inputs are never episodes or learning labels.
        for count in (12, 22):
            actions = " ".join(
                f"{chr(65 + i)}:" + ("W" if i == 0 else "K3.5,14" if i % 2 else "G14.5,25.5")
                for i in range(count)
            )
            self.choose(
                {
                    "images": [],
                    "prompt": prompt + actions,
                    "choices": list(range(count)),
                    "controller_version": 3,
                    "cache_bypass": True,
                    "feature_path": str(self.learner.directory / "features/session-warmup.npz"),
                }
            )
        if weights_digest(self.learner.adapter) != before:
            raise RuntimeError("Warmup modified adapter weights")
        self.fast_warmed = True
        return {"warmed": True, "already_warm": False, "training_samples_added": 0}

    def train(self, request):
        path = str(Path(request["episode"]).resolve())
        if path in getattr(self.learner, "metadata", {}).get("episodes", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        episode = episode_samples(request["episode"], self.learner, self.spec)
        if episode is None:
            return {"updated": False, "reason": "no_verified_result"}
        report = self.learner.train(episode["samples"], episode["reward"], episode["episode"])
        directory = Path(episode["episode"])
        atomic_json(directory / "training.json", report)
        return report

    def train_batch(self, request):
        paths = request.get("episodes", [])
        if not 1 <= len(paths) <= 2 or len({str(Path(path).resolve()) for path in paths}) != len(
            paths
        ):
            raise ValueError("Expected one or two distinct episode directories")
        if all(
            str(Path(path).resolve()) in getattr(self.learner, "metadata", {}).get("episodes", [])
            for path in paths
        ):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        # Resolve every behavior checksum before the first weight update.
        episodes = [episode_samples(path, self.learner, self.spec) for path in paths]
        if any(episode is None for episode in episodes):
            return {"updated": False, "reason": "no_verified_result"}
        report = self.learner.train_batch(episodes)
        for episode in episodes:
            atomic_json(Path(episode["episode"]) / "training.json", report)
        return report

    def imitate(self, request):
        if self.learner.metadata.get("controller_version") != 3:
            raise ValueError("Opponent imitation requires the private fast controller")
        dataset, identity, path = load_demonstrations(
            request["dataset"], self.directory.parents[1] / "counterpush/quarantine.json"
        )
        if identity in self.learner.metadata.get("demonstrations", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        samples = []
        for observation in dataset["samples"]:
            # The fast controller reads only the BEFORE situation text. The after
            # frame validated the tracked label and is never an inference input.
            feature_path = path.parent / "features" / f"{observation['id']}.npz"
            prediction = self.choose(
                {
                    "images": [str(path.parent / observation["image"])],
                    "prompt": mirror_actor_prompt(observation),
                    "choices": observation["choices"],
                    "feature_path": str(feature_path),
                    "controller_version": 3,
                }
            )
            behavior = prediction["behavior"]
            samples.append(
                {
                    **mx.load(str(feature_path)),
                    "id": observation["id"],
                    "labels": behavior["labels"],
                    "version": behavior["version"],
                    "old_log_probs": mx.array(behavior["old_log_probs"]),
                    "targets": [
                        observation["choices"].index(target) for target in observation["target_ids"]
                    ],
                    "confidence": observation["confidence"],
                }
            )
        report = self.learner.imitate(samples, identity)
        report.update(
            {
                "model": self.spec["name"],
                "model_identity": self.spec["identity"],
                "source": "counterpush_live_screen",
                "observed_label": "mirror_actor_card_lane_or_placement_region",
            }
        )
        atomic_json(path.parent / "training.json", report)
        return report
