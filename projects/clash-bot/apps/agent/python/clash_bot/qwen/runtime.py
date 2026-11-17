"""Own one resident Qwen backbone, private learners and frozen evaluations."""

import secrets
from pathlib import Path

import mlx.core as mx
from mlx_vlm import load
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import prepare_inputs

from clash_bot.qwen.action_prior import action_prior
from clash_bot.qwen.adapter_roles import AdapterRoles
from clash_bot.qwen.decision_input import CONTRACT
from clash_bot.qwen.feature_cache import FeatureCache
from clash_bot.qwen.game_training import GameTraining
from clash_bot.qwen.learner import Learner
from clash_bot.qwen.learning_policy import FORMAT, FinalMLPLoRA, weights_digest
from clash_bot.qwen.model_specs import MODEL, require_model_directory, verify_model
from clash_bot.qwen.search_study import SearchStudy
from clash_bot.qwen.text_prefix import FrozenTextPrefix, common_prefix_length

from .features import AdaptedFinalNorm, Capture, output_token_rows


class LearningWorker(AdapterRoles, SearchStudy, GameTraining):
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
        self.text_prefix = FrozenTextPrefix()

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
        prefix_hit, prefix_length = False, 0
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
            if text_only and request["prompt"].startswith(CONTRACT["header"]):
                prefix_prompt = apply_chat_template(
                    self.processor,
                    self.model.config,
                    CONTRACT["header"],
                    num_images=0,
                    enable_thinking=False,
                )
                prefix_length = common_prefix_length(
                    token_ids[0].tolist(),
                    self.processor.tokenizer.encode(prefix_prompt, add_special_tokens=False),
                )
            if prefix_length:
                output, prefix_hit = self.text_prefix.forward(
                    self.model.language_model, token_ids, embeddings, prefix_length
                )
            else:
                output = self.model.language_model(
                    token_ids,
                    mask=mask,
                    **embeddings.to_dict(),
                    skip_logits=True,
                    return_hidden=True,
                )
            features = mx.stop_gradient(self.sink["features"].astype(mx.float32))
            base = mx.stop_gradient(self.sink["base"].astype(mx.float32))
            mx.eval(features, base)
            if key:
                self.feature_cache.put(key, {"features": features, "base": base})
        else:
            features, base = cached["features"], cached["base"]
        policy_bias = (
            mx.array(action_prior(request["prompt"], len(choices)))
            if text_only
            else mx.zeros(len(choices))
        )
        sample = {
            "features": features,
            "base": base,
            "labels": list(range(len(choices))),
            "policy_bias": policy_bias,
        }
        # Score the hidden state returned by the adapted Qwen itself. Training uses
        # the equivalent cached-feature computation to avoid a full-model backward.
        if text_only:
            log_probs = self.learner.policy_log_probs(sample)
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
        mx.savez(str(destination), features=features, base=base, policy_bias=policy_bias)
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
                "prefix_cache_hit": prefix_hit,
                "prefix_tokens": prefix_length,
                "prefix_cache_bytes": self.text_prefix.nbytes,
                "policy_bias": policy_bias.tolist(),
                "action_prior": "grouped_forecast_v1" if text_only else "none",
                "policy_input": "public_text_v3" if text_only else "image_and_text",
                "adapter_sha256": weights_digest(self.learner.adapter),
            },
        }

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
