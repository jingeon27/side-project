"""Resident Qwen inference + on-policy LoRA learning, JSON lines over stdio."""

import contextlib
import json
import re
from pathlib import Path
import secrets
import shutil
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
from search_data import load_search_targets
from promotion import parent_sha, publish
from feature_cache import FeatureCache
from replay import remember, rehearse
from decision_input import opponent_prompt, CONTRACT
from external_policy import choose_external


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
    if row.get('type') == 'ability_check':
        return (row.get('confirmed') is True and row.get('changed') is True
                and row.get('handUnchanged') is True and row.get('expectedCost') == 2
                and row.get('action', {}).get('kind') == 'ability'
                and row.get('action', {}).get('card') == 'ice_wizard')
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
        self.evaluation_backup = None
        self.champion_learner = self.learner
        self.feature_cache = FeatureCache(self.directory.parents[1]/'qwen/feature-cache',self.spec['input_size'],self.spec['hidden_size'])

    def candidate_active(self):
        return self.learner.directory.resolve() != self.directory.resolve()

    def bind(self, learner):
        self.learner = learner
        self.model.language_model.model.norm.adapter = learner.adapter

    def status(self):
        champion = self.evaluation_backup['metadata'] if self.evaluation_backup else getattr(self, 'champion_learner', self.learner).metadata
        return {**self.learner.metadata, 'model': self.spec['name'], 'weights_sha256': weights_digest(self.learner.adapter),
                'role': 'evaluation' if self.evaluation_backup else 'candidate_training' if self.candidate_active() else 'champion',
                'champion_version': champion['version'],
                'champion_sha256': champion.get('weights_sha256', weights_digest(getattr(self, 'champion_learner', self.learner).adapter)),
                'directory': str(self.learner.directory),
                'checkpoint': str(self.learner.directory / 'checkpoints' / f'v{self.learner.metadata["version"]:06d}')}

    def begin_candidate(self, directory):
        if self.evaluation_backup:
            raise ValueError('Frozen evaluation cannot switch to training')
        champion = getattr(self, 'champion_learner', self.learner)
        self.champion_learner = champion
        root = Path(directory).resolve()
        allowed = self.directory.resolve().parents[1] / 'arena/qwen'
        if not root.is_relative_to(allowed):
            raise ValueError('Training candidate must stay in the owned arena directory')
        parent = champion.metadata['weights_sha256']
        if not (root / 'current.json').exists():
            base = self.directory / 'checkpoints' / f'v{champion.metadata["version"]:06d}'
            destination = root / 'checkpoints' / base.name
            shutil.copytree(base, destination, dirs_exist_ok=True)
            atomic_json(destination / 'metadata.json', {**champion.metadata, 'candidate_parent_sha256': parent,
                                                        'deployment_role': 'candidate'})
            atomic_json(root / 'current.json', {'version': champion.metadata['version'], 'weights_sha256': parent})
        candidate = Learner(FinalMLPLoRA(self.spec['input_size'], self.spec['hidden_size']), champion.norm_weight,
                            champion.norm_eps, champion.token_rows, root, self.spec['identity'], champion.metadata['target'])
        if parent_sha(candidate.metadata) != parent:
            raise ValueError('Training candidate was made against a stale champion')
        self.bind(candidate)
        return self.status()

    def end_candidate(self):
        if self.evaluation_backup:
            raise ValueError('Restore frozen evaluation before leaving training')
        self.bind(getattr(self, 'champion_learner', self.learner))
        return self.status()

    def configure_candidate(self, version):
        if self.evaluation_backup or not self.candidate_active() or version not in (2,3):
            raise ValueError('Only a private training candidate can select a new controller')
        if self.learner.metadata.get('controller_version', 1) == version:
            return self.status()
        metadata = {**self.learner.metadata, 'controller_version': version,
                    'version': self.learner.metadata['version'] + 1,
                    'warmup_base_datasets':len(self.learner.metadata.get('search_datasets',[])),
                    'last_configuration': 'compact public text + frozen feature replay' if version == 3 else 'full affordable hand, compact visual prompt'}
        self.learner.save(metadata); self.learner.metadata = metadata
        return self.status()

    def promote(self, request):
        if self.evaluation_backup or self.candidate_active():
            raise ValueError('Restore the champion before publishing')
        checkpoint = Path(request['checkpoint']).resolve()
        if not checkpoint.is_relative_to(self.directory.resolve().parents[1] / 'arena/qwen'):
            raise ValueError('Candidate checkpoint escaped the arena directory')
        metadata = json.loads((checkpoint / 'metadata.json').read_text())
        if metadata['format'] != FORMAT or metadata['model_sha256'] != self.spec['identity']:
            raise ValueError('Candidate belongs to another base model')
        fresh = FinalMLPLoRA(self.spec['input_size'], self.spec['hidden_size'])
        fresh.load_weights(str(checkpoint / 'adapter.safetensors'), strict=True)
        mx.load(str(checkpoint / 'optimizer.safetensors'))  # Verify readable optimizer before publication.
        result = publish(self.directory, checkpoint, request['report'], weights_digest(fresh))
        if result['promoted']:
            old = self.learner
            self.champion_learner = Learner(FinalMLPLoRA(self.spec['input_size'], self.spec['hidden_size']), old.norm_weight,
                                            old.norm_eps, old.token_rows, self.directory, self.spec['identity'], old.metadata['target'])
            self.bind(self.champion_learner)
        return {**result, 'champion': self.status()}

    def choose(self, request):
        controller = self.learner.metadata.get('controller_version', 1)
        if request.get('controller_version', 1) != controller:
            raise ValueError('Decision controller does not match the frozen policy')
        choices = request["choices"]
        if not 1 <= len(choices) <= 26 or len(set(choices)) != len(choices):
            raise ValueError("Invalid legal action list")
        version = self.learner.metadata["version"]
        if len(choices) == 1:
            return {"choice": choices[0], "behavior": {"format": FORMAT, "version": version,
                    "model_identity": self.spec['identity'], "model": self.spec['name'],
                    "trainable": False, "reason": "single_legal_action", "read_only_evaluation": self.evaluation_backup is not None,
                    "selection": "categorical_as_live", "controller_version": controller,
                    "adapter_sha256": weights_digest(self.learner.adapter)}}
        text_only = controller >= 3
        prompt = apply_chat_template(self.processor, self.model.config, request["prompt"], num_images=0 if text_only else 1, enable_thinking=False)
        key = self.feature_cache.key(self.spec['identity'],prompt,controller) if text_only else None
        cached = self.feature_cache.get(key) if key and not request.get('cache_bypass') else None
        if cached is None:
            inputs = prepare_inputs(self.processor, images=[] if text_only else request["images"], prompts=prompt,
                                    image_token_index=self.model.config.image_token_index)
            token_ids = inputs.pop("input_ids")
            pixels = inputs.pop("pixel_values", None)
            mask = inputs.pop("attention_mask", None)
            embeddings = self.model.get_input_embeddings(token_ids, pixels, mask=mask, **inputs)
            output = self.model.language_model(token_ids, mask=mask, **embeddings.to_dict(), skip_logits=True, return_hidden=True)
            features = mx.stop_gradient(self.sink["features"].astype(mx.float32))
            base = mx.stop_gradient(self.sink["base"].astype(mx.float32))
            mx.eval(features,base)
            if key:
                self.feature_cache.put(key,{'features':features,'base':base})
        else:
            features,base = cached['features'],cached['base']
        sample = {"features": features, "base": base, "labels": list(range(len(choices)))}
        # Score the hidden state returned by the adapted Qwen itself. Training uses
        # the equivalent cached-feature computation to avoid a full-model backward.
        if text_only:
            log_probs = self.learner.log_probs(sample)
        else:
            hidden = output.hidden_states[-1][0, -1]
            logits = hidden @ self.learner.token_rows[mx.array(sample["labels"])].astype(mx.float32).T
            log_probs = logits - mx.logsumexp(logits)
        # Frozen evaluation uses the same categorical action policy as live
        # play; freezing prevents learning, not stochastic action sampling.
        chosen = int(mx.random.categorical(log_probs).item())
        mx.eval(features, base, log_probs)
        destination = Path(request["feature_path"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        mx.savez(str(destination), features=features, base=base)
        return {"choice": choices[chosen], "behavior": {"format": FORMAT, "version": version,
                "model_identity": self.spec['identity'], "model": self.spec['name'],
                "trainable": self.evaluation_backup is None and (self.candidate_active() or not (self.directory / 'promotion-policy.json').exists()),
                "read_only_evaluation": self.evaluation_backup is not None,
                "selection": "categorical_as_live",
                "controller_version": controller,
                "choices": choices, "chosen": chosen, "labels": sample["labels"],
                "old_log_probs": log_probs.tolist(), "feature_path": str(destination),
                "adapter_applied_inside_qwen": cached is None,
                'feature_cache_hit':cached is not None,'policy_input':'public_text_v3' if text_only else 'image_and_text',
                "adapter_sha256": weights_digest(self.learner.adapter)}}

    def checkout(self, checkpoint=None):
        """Frozen A/B weights in one resident model, without moving current.json."""
        if self.candidate_active():
            raise ValueError('Leave candidate training before frozen evaluation')
        if checkpoint is None:
            if self.evaluation_backup:
                self.learner.adapter.load_weights(str(self.evaluation_backup['path'] / 'adapter.safetensors'), strict=True)
                self.learner.metadata = self.evaluation_backup['metadata']
                self.evaluation_backup = None
            return {'restored': True, **self.learner.metadata, 'weights_sha256': weights_digest(self.learner.adapter)}
        checkpoint = Path(checkpoint).resolve()
        metadata = json.loads((checkpoint / 'metadata.json').read_text())
        if metadata['format'] != FORMAT or metadata['model_sha256'] != self.spec['identity']:
            raise ValueError('Evaluation checkpoint belongs to another base model')
        fresh = FinalMLPLoRA(self.spec['input_size'], self.spec['hidden_size'])
        fresh.load_weights(str(checkpoint / 'adapter.safetensors'), strict=True)
        if weights_digest(fresh) != metadata['weights_sha256']:
            raise ValueError('Evaluation checkpoint checksum mismatch')
        if self.evaluation_backup is None:
            current = self.directory / 'checkpoints' / f'v{self.learner.metadata["version"]:06d}'
            if not current.exists():
                raise ValueError('Save a baseline checkpoint before frozen evaluation')
            self.evaluation_backup = {'path': current, 'metadata': self.learner.metadata}
        from mlx.utils import tree_flatten, tree_unflatten
        self.learner.adapter.update(tree_unflatten(tree_flatten(fresh.trainable_parameters())))
        self.learner.metadata = metadata
        return {'readOnly': True, 'checkpoint': str(checkpoint), 'version': metadata['version'],
                'weights_sha256': weights_digest(self.learner.adapter)}

    def study(self, request):
        if self.evaluation_backup:
            raise ValueError('Frozen evaluation cannot train')
        dataset, identity, path = load_search_targets(request['dataset'])
        if request.get('candidate'):
            if not self.candidate_active():
                raise ValueError('Search training requires a private candidate')
            report = self.distill_dataset(dataset, identity, path)
            return {**report, 'candidate_checkpoint': self.status()['checkpoint'],
                    'candidate_sha256': weights_digest(self.learner.adapter), 'deployed': False,
                    'baseline_sha256': getattr(self, 'champion_learner', self.learner).metadata['weights_sha256']}
        if self.candidate_active():
            raise ValueError('Use candidate search training in the private context')
        original = self.learner
        parent = weights_digest(original.adapter)
        root = self.directory.parents[1] / 'arena/qwen/candidates' / f'{identity[:16]}-{parent[:12]}'
        if not (root / 'current.json').exists():
            base = self.directory / 'checkpoints' / f'v{original.metadata["version"]:06d}'
            if not base.exists():
                raise ValueError('Search study requires a saved real-play baseline')
            destination = root / 'checkpoints' / base.name
            shutil.copytree(base, destination, dirs_exist_ok=True)
            atomic_json(destination / 'metadata.json', {**original.metadata, 'study_parent': parent,
                                                        'study_rules_id': dataset['rulesID']})
            atomic_json(root / 'current.json', {'version': original.metadata['version'], 'weights_sha256': parent})
        candidate = Learner(FinalMLPLoRA(self.spec['input_size'], self.spec['hidden_size']), original.norm_weight,
                            original.norm_eps, original.token_rows, root, self.spec['identity'], original.metadata['target'])
        self.learner = candidate
        self.model.language_model.model.norm.adapter = candidate.adapter
        try:
            if dataset.get('controllerVersion') in (2,3):
                self.configure_candidate(dataset['controllerVersion'])
            if identity in candidate.metadata.get('search_datasets', []):
                report = {'updated': False, 'reason': 'already_trained', 'version': candidate.metadata['version']}
            else:
                report = self.distill_dataset(dataset, identity, path)
            checkpoint = root / 'checkpoints' / f'v{candidate.metadata["version"]:06d}'
            result = {**report, 'candidate_checkpoint': str(checkpoint), 'baseline_sha256': parent,
                      'candidate_sha256': weights_digest(candidate.adapter), 'dataset': str(path),
                      'model': self.spec['name'], 'deployed': False}
            atomic_json(root / 'study.json', result)
            return result
        finally:
            self.learner = original
            self.model.language_model.model.norm.adapter = original.adapter
            if weights_digest(original.adapter) != parent:
                raise RuntimeError('Isolated study modified the active adapter')

    def distill_dataset(self, dataset, identity, path):
        if identity in self.learner.metadata.get('search_datasets', []):
            return {'updated': False, 'reason': 'already_trained', 'version': self.learner.metadata['version']}
        samples = []
        for row in dataset['samples']:
            feature = self.learner.directory / 'features' / identity / f'{len(samples):03d}.npz'
            behavior = self.choose({'images': [str(path.parent / row['image'])], 'prompt': row['prompt'],
                                    'choices': row['choices'], 'feature_path': str(feature),
                                    'controller_version': row.get('controllerVersion', 1)})['behavior']
            samples.append({**mx.load(str(feature)), 'labels': behavior['labels'], 'version': behavior['version'],
                            'old_log_probs': mx.array(behavior['old_log_probs']), 'search_target': row['target']})
        report = self.learner.distill_search(samples, identity, dataset['rulesID'],epochs=dataset.get('trainingEpochs',1))
        remember(self.learner,dataset,identity,samples)
        if report.get('updated') and dataset.get('controllerVersion') in (2,3):
            atomic_json(self.learner.directory / 'actor-anchors.json', {'version':2,'samples':[
                {'path':str(self.learner.directory/'features'/identity/f'{index:03d}.npz'),
                 'labels':sample['labels'],'search_target':sample['search_target']} for index,sample in enumerate(samples)]})
        return report

    def rehearse(self, request):
        if self.evaluation_backup or not self.candidate_active():
            raise ValueError('Replay requires a private training candidate')
        return rehearse(self.learner,request.get('rounds',4))

    def warmup(self):
        if self.evaluation_backup or not self.candidate_active() or self.learner.metadata.get('controller_version')!=3:
            raise ValueError('Warmup requires the private fast controller')
        if getattr(self,'fast_warmed',False):
            return {'warmed':True,'already_warm':True,'training_samples_added':0}
        before=weights_digest(self.learner.adapter)
        prompt=CONTRACT['header']+'mana=10;enemyMana=0-10;hand=KIFG;next=P;own=;enemy=;effects=;skill=0\n'
        # Exercise the actual frozen backbone before starting a timed match.
        # These synthetic warmup inputs are never episodes or learning labels.
        for count in (12,22):
            actions=' '.join(f'{chr(65+i)}:'+('W' if i==0 else 'K3.5,14' if i%2 else 'G14.5,25.5') for i in range(count))
            self.choose({'images':[],'prompt':prompt+actions,'choices':list(range(count)),'controller_version':3,
                         'cache_bypass':True,'feature_path':str(self.learner.directory/'features/session-warmup.npz')})
        if weights_digest(self.learner.adapter)!=before:
            raise RuntimeError('Warmup modified adapter weights')
        self.fast_warmed=True
        return {'warmed':True,'already_warm':False,'training_samples_added':0}

    def episode_samples(self, episode):
        directory = Path(episode).resolve()
        rows = [json.loads(line) for line in (directory / "events.jsonl").read_text().splitlines() if line]
        if any(row.get('type')=='input_recovery' or row.get('behavior', {}).get('read_only_external') for row in rows):
            return None
        results = [row for row in rows if verified_result(row)]
        if not results:
            return None
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
        return {'samples': samples, 'reward': reward, 'episode': str(directory)}

    def train(self, request):
        path = str(Path(request['episode']).resolve())
        if path in getattr(self.learner, 'metadata', {}).get('episodes', []):
            return {'updated': False, 'reason': 'already_trained', 'version': self.learner.metadata['version']}
        episode = self.episode_samples(request['episode'])
        if episode is None:
            return {'updated': False, 'reason': 'no_verified_result'}
        report = self.learner.train(episode['samples'], episode['reward'], episode['episode'])
        directory = Path(episode['episode'])
        atomic_json(directory / "training.json", report)
        return report

    def train_batch(self, request):
        paths = request.get('episodes', [])
        if not 1 <= len(paths) <= 2 or len({str(Path(path).resolve()) for path in paths}) != len(paths):
            raise ValueError('Expected one or two distinct episode directories')
        if all(str(Path(path).resolve()) in getattr(self.learner, 'metadata', {}).get('episodes', []) for path in paths):
            return {'updated': False, 'reason': 'already_trained', 'version': self.learner.metadata['version']}
        # Resolve every behavior checksum before the first weight update.
        episodes = [self.episode_samples(path) for path in paths]
        if any(episode is None for episode in episodes):
            return {'updated': False, 'reason': 'no_verified_result'}
        report = self.learner.train_batch(episodes)
        for episode in episodes:
            atomic_json(Path(episode['episode']) / 'training.json', report)
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
                                      'prompt': opponent_prompt(observation) if self.learner.metadata.get('controller_version',1)>=3 else observation['prompt'], 'choices': observation['choices'],
                                      'feature_path': str(feature_path),
                                      'controller_version': self.learner.metadata.get('controller_version', 1)})
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
                if worker.evaluation_backup and request['op'] in ('train', 'train_batch', 'imitate', 'study', 'begin_candidate', 'promote'):
                    raise ValueError('Frozen evaluation cannot train')
                if (request['op'] in ('train', 'train_batch', 'imitate') and not worker.candidate_active()
                        and (worker.directory / 'promotion-policy.json').exists()):
                    raise ValueError('The deployed champion is frozen; train a private candidate')
                if request["op"] == "choose":
                    result = worker.choose(request)
                elif request['op'] == 'choose_external':
                    result = choose_external(worker, request)
                elif request["op"] == "train":
                    result = worker.train(request)
                elif request["op"] == "train_batch":
                    result = worker.train_batch(request)
                elif request["op"] == "imitate":
                    result = worker.imitate(request)
                elif request["op"] == "study":
                    result = worker.study(request)
                elif request["op"] == "checkout":
                    result = worker.checkout(request.get('checkpoint'))
                elif request['op'] == 'begin_candidate':
                    result = worker.begin_candidate(request['directory'])
                elif request['op'] == 'end_candidate':
                    result = worker.end_candidate()
                elif request['op'] == 'configure_candidate':
                    result = worker.configure_candidate(request['controller_version'])
                elif request['op'] == 'rehearse':
                    result = worker.rehearse(request)
                elif request['op'] == 'warmup':
                    result = worker.warmup()
                elif request['op'] == 'promote':
                    result = worker.promote(request)
                elif request["op"] == "observe":
                    result = worker.observe(request)
                elif request["op"] == "status":
                    result = worker.status()
                else:
                    raise ValueError("Unsupported learning operation")
            emit({"type": "result", **result, "elapsed_ms": round((time.monotonic() - started) * 1000),
                  "peak_gb": mx.get_peak_memory() / 1024 ** 3})
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
