"""Resident Qwen inference + on-policy LoRA learning, JSON lines over stdio."""

import contextlib
import json
import re
from pathlib import Path
import secrets
import sys
import time
import traceback

import mlx.core as mx
import mlx.nn as nn
from mlx_vlm import load
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import prepare_inputs

from learning_policy import FORMAT, MODEL_SHA256, FinalMLPLoRA, Learner, atomic_json, weights_digest
from model_specs import detect_model, verify_model
from opponent_data import load_demonstrations


def verified_result(row):
    if row.get('type') != 'result':
        return False
    if row.get('source') == 'crown_pixels_verified2':
        return True
    if row.get('source') != 'counterpush_result_dom_verified2':
        return False
    readings = row.get('readings', [])
    if len(readings) != 2 or readings[0] != readings[1] or not isinstance(readings[0], str):
        return False
    match = re.fullmatch(r'Crowns: you ([0-3]), the opponent ([0-3])(?:, overtime)?', readings[0])
    return match is not None and [int(match[1]), int(match[2])] == [row.get('blue'), row.get('red')]


def confirmed_input(row):
    if row.get('type') != 'input_check':
        return False
    # Counterpush records explicit confirmation after the spend animation has
    # settled. Legacy Android episodes retain their hand-change/spend contract.
    if 'confirmed' in row:
        return row['confirmed'] is True and row.get('changed') is True
    return row.get('changed') is True and row.get('spent', 0) >= 1


def output_token_rows(language_model, token_ids, tied_output):
    projection = language_model.model.embed_tokens if tied_output else language_model.lm_head
    if isinstance(projection, (nn.QuantizedEmbedding, nn.QuantizedLinear)):
        return mx.dequantize(projection.weight[token_ids], projection.scales[token_ids].astype(mx.float32), projection.biases[token_ids].astype(mx.float32),
                             group_size=projection.group_size, bits=projection.bits, mode=projection.mode)
    return projection.weight[token_ids]


class Capture(nn.Module):
    def __init__(self, original, sink, key):
        super().__init__()
        self.original = original
        object.__setattr__(self, "_record", lambda value: sink.update({key: value[0, -1]}))

    def __call__(self, value):
        self._record(value)
        return self.original(value)


class AdaptedFinalNorm(nn.Module):
    """Apply the last-MLP low-rank delta inside Qwen, before its native RMSNorm.

    Only the last token is needed for the one-token legal-action policy. Earlier
    tokens have no subsequent attention layer, so their LoRA deltas can be skipped.
    """
    def __init__(self, original, adapter, sink):
        super().__init__()
        self.original = original
        self.adapter = adapter
        object.__setattr__(self, "_sink", sink)

    def __call__(self, value):
        self._sink["base"] = value[0, -1]
        last = value[:, -1:, :].astype(mx.float32) + self.adapter(self._sink["features"])[None, None, :]
        normalized = self.original(value).astype(mx.float32)
        return mx.concatenate([normalized[:, :-1, :], self.original(last)], axis=1)


class LearningWorker:
    def __init__(self, model_path, directory):
        self.spec = detect_model(model_path)
        if not self.spec['learning']:
            raise ValueError('This model does not support the learning controller')
        mx.set_cache_limit(256 * 1024 * 1024)
        mx.set_memory_limit(self.spec['memory_gib'] * 1024 ** 3)
        mx.random.seed(secrets.randbits(32))
        verify_model(model_path, self.spec)
        self.model, self.processor = load(model_path, trust_remote_code=False)
        config = self.model.config.text_config
        if (config.hidden_size != self.spec['hidden_size'] or config.intermediate_size != self.spec['input_size']
                or config.num_hidden_layers != self.spec['layers'] or config.tie_word_embeddings != self.spec['tied_output']):
            raise ValueError('Model architecture does not match the pinned specification')
        self.model.freeze()
        self.model.eval()
        self.sink = {}
        core = self.model.language_model.model
        core.layers[-1].mlp.down_proj = Capture(core.layers[-1].mlp.down_proj, self.sink, "features")
        norm = core.norm
        self.tokens = [self.processor.tokenizer.encode(chr(65 + i), add_special_tokens=False) for i in range(26)]
        if any(len(token) != 1 for token in self.tokens):
            raise ValueError("Action labels must encode as one Qwen token")
        token_ids = mx.array([token[0] for token in self.tokens])
        token_rows = output_token_rows(self.model.language_model, token_ids, config.tie_word_embeddings)
        mx.eval(token_rows)
        self.learner = Learner(FinalMLPLoRA(config.intermediate_size, config.hidden_size), norm.weight,
                               config.rms_norm_eps, token_rows, directory, self.spec['identity'],
                               f'language_model.model.layers.{config.num_hidden_layers - 1}.mlp.down_proj')
        core.norm = AdaptedFinalNorm(norm, self.learner.adapter, self.sink)
        self.directory = Path(directory)

    def choose(self, request):
        choices = request["choices"]
        if not 1 <= len(choices) <= 26 or len(set(choices)) != len(choices):
            raise ValueError("Invalid legal action list")
        version = self.learner.metadata["version"]
        if len(choices) == 1:
            return {"choice": choices[0], "behavior": {"format": FORMAT, "version": version,
                    "model_identity": self.spec['identity'], "model": self.spec['name'],
                    "trainable": False, "reason": "single_legal_action"}}
        prompt = apply_chat_template(self.processor, self.model.config, request["prompt"], num_images=1, enable_thinking=False)
        inputs = prepare_inputs(self.processor, images=request["images"], prompts=prompt,
                                image_token_index=self.model.config.image_token_index)
        token_ids = inputs.pop("input_ids")
        pixels = inputs.pop("pixel_values", None)
        mask = inputs.pop("attention_mask", None)
        embeddings = self.model.get_input_embeddings(token_ids, pixels, mask=mask, **inputs)
        output = self.model.language_model(token_ids, mask=mask, **embeddings.to_dict(), skip_logits=True, return_hidden=True)
        features = mx.stop_gradient(self.sink["features"].astype(mx.float32))
        base = mx.stop_gradient(self.sink["base"].astype(mx.float32))
        sample = {"features": features, "base": base, "labels": list(range(len(choices)))}
        # Score the hidden state returned by the adapted Qwen itself. Training uses
        # the equivalent cached-feature computation to avoid a full-model backward.
        hidden = output.hidden_states[-1][0, -1]
        logits = hidden @ self.learner.token_rows[mx.array(sample["labels"])].astype(mx.float32).T
        log_probs = logits - mx.logsumexp(logits)
        chosen = int(mx.random.categorical(log_probs).item())
        mx.eval(features, base, log_probs)
        destination = Path(request["feature_path"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        mx.savez(str(destination), features=features, base=base)
        return {"choice": choices[chosen], "behavior": {"format": FORMAT, "version": version,
                "model_identity": self.spec['identity'], "model": self.spec['name'],
                "trainable": True, "choices": choices, "chosen": chosen, "labels": sample["labels"],
                "old_log_probs": log_probs.tolist(), "feature_path": str(destination),
                "adapter_applied_inside_qwen": True,
                "adapter_sha256": weights_digest(self.learner.adapter)}}

    def train(self, request):
        directory = Path(request["episode"]).resolve()
        rows = [json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines() if line]
        results = [row for row in rows if verified_result(row)]
        if not results:
            return {"updated": False, "reason": "no_verified_result"}
        result = results[-1]
        blue, red = result["blue"], result["red"]
        if not all(isinstance(value, int) and 0 <= value <= 3 for value in (blue, red)):
            raise ValueError("Invalid crown result")
        reward = (blue > red) - (blue < red)
        confirmed = {int(row["frame"]) for row in rows if
                     confirmed_input(row)
                     or (row.get("type") == "wait_check" and row.get("valid") is True)}
        decisions = [row for row in rows if row.get("type") == "prediction" and
                     row.get("behavior", {}).get("format") == FORMAT and row["behavior"].get("trainable") and
                     Path(row["image"]).stem.isdigit() and int(Path(row["image"]).stem) in confirmed]
        samples = []
        for index, decision in enumerate(decisions):
            behavior = decision["behavior"]
            if behavior.get('model_identity', MODEL_SHA256) != self.spec['identity']:
                raise ValueError('Episode belongs to a different base model')
            feature_path = Path(behavior["feature_path"]).resolve()
            if feature_path.parent != directory / "features":
                raise ValueError("Feature file escaped the episode directory")
            feature = mx.load(str(feature_path))
            if feature["features"].shape != (self.spec['input_size'],) or feature["base"].shape != (self.spec['hidden_size'],):
                raise ValueError("Invalid frozen Qwen feature shape")
            sample = {**feature, "labels": behavior["labels"], "chosen": behavior["chosen"],
                      "old_log_probs": mx.array(behavior["old_log_probs"]), "version": behavior["version"],
                      "remaining": len(decisions) - index - 1}
            if behavior["adapter_sha256"] != weights_digest(self.learner.adapter):
                raise ValueError("Episode adapter checksum does not match current policy")
            samples.append(sample)
        report = self.learner.train(samples, reward, str(directory))
        atomic_json(directory / "training.json", report)
        return report

    def observe(self, request):
        from mlx_vlm import generate
        from mlx_vlm.structured import build_json_schema_logits_processor
        images = request['images']
        if not 1 <= len(images) <= 3:
            raise ValueError('Expected 1 to 3 opponent observation frames')
        prompt = apply_chat_template(self.processor, self.model.config, request['prompt'],
                                     num_images=len(images), enable_thinking=False)
        output = generate(self.model, self.processor, prompt, image=images,
                          max_tokens=min(256, int(request.get('max_tokens', 128))),
                          temperature=0, verbose=False, enable_thinking=False,
                          logits_processors=[build_json_schema_logits_processor(self.processor.tokenizer, request['schema'])])
        return {'text': output.text}

    def imitate(self, request):
        dataset, identity, path = load_demonstrations(request['dataset'], self.directory.parents[1] / 'counterpush/quarantine.json')
        if identity in self.learner.metadata.get('demonstrations', []):
            return {'updated': False, 'reason': 'already_trained', 'version': self.learner.metadata['version']}
        samples = []
        for observation in dataset['samples']:
            # Only the BEFORE image is fed to Qwen. The after frame validates the
            # external visual annotation and is never a leaked inference input.
            feature_path = path.parent / 'features' / f"{observation['id']}.npz"
            prediction = self.choose({'images': [str(path.parent / observation['image'])],
                                      'prompt': observation['prompt'], 'choices': observation['choices'],
                                      'feature_path': str(feature_path)})
            behavior = prediction['behavior']
            samples.append({**mx.load(str(feature_path)), 'id': observation['id'],
                            'labels': behavior['labels'], 'version': behavior['version'],
                            'old_log_probs': mx.array(behavior['old_log_probs']),
                            'targets': [observation['choices'].index(target) for target in observation['target_ids']],
                            'confidence': observation['confidence']})
        report = self.learner.imitate(samples, identity)
        report.update({'model': self.spec['name'], 'model_identity': self.spec['identity'],
                       'source': 'counterpush_live_screen', 'observed_label': 'card_and_lane_only'})
        atomic_json(path.parent / 'training.json', report)
        return report


def emit(value):
    print(json.dumps(value), flush=True)


def main():
    with contextlib.redirect_stdout(sys.stderr):
        worker = LearningWorker(sys.argv[1], sys.argv[2])
    emit({"type": "ready", "version": worker.learner.metadata["version"],
          "weights_sha256": weights_digest(worker.learner.adapter)})
    for line in sys.stdin:
        started = time.monotonic()
        try:
            request = json.loads(line)
            with contextlib.redirect_stdout(sys.stderr):
                if request["op"] == "choose":
                    result = worker.choose(request)
                elif request["op"] == "train":
                    result = worker.train(request)
                elif request["op"] == "imitate":
                    result = worker.imitate(request)
                elif request["op"] == "observe":
                    result = worker.observe(request)
                elif request["op"] == "status":
                    result = {**worker.learner.metadata, "model": worker.spec['name'],
                              "weights_sha256": weights_digest(worker.learner.adapter)}
                else:
                    raise ValueError("Unsupported learning operation")
            emit({"type": "result", **result, "elapsed_ms": round((time.monotonic() - started) * 1000),
                  "peak_gb": mx.get_peak_memory() / 1024 ** 3})
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
