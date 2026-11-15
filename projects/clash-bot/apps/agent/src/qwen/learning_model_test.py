"""Explicit real-model integration check; ordinary unit tests skip this."""

import os
from pathlib import Path
import tempfile
import unittest

import mlx.core as mx
from mlx.utils import tree_flatten
from PIL import Image

from learning_worker import LearningWorker
from learning_policy import FinalMLPLoRA, Learner, weights_digest
from model_specs import MODELS, DEFAULT_MODEL


@unittest.skipUnless(os.environ.get("RUN_QWEN_INTEGRATION") == "1", "real-model check is opt-in")
class LearningModelTest(unittest.TestCase):
    def test_qwen_internal_adapter_matches_cached_feature_training(self):
        spec = MODELS[os.environ.get('QWEN_TEST_MODEL', DEFAULT_MODEL)]
        model = Path(__file__).resolve().parents[4] / '.data/qwen' / spec['directory']
        with tempfile.TemporaryDirectory() as directory:
            worker = LearningWorker(str(model), str(Path(directory) / 'checkpoints'))
            worker.learner.adapter.b = mx.random.normal((4, spec['hidden_size'])) * 0.001
            image = Path(directory) / 'scene.png'
            Image.new('RGB', (368, 652), '#375f48').save(image)
            feature_path = Path(directory) / 'features.npz'
            decision = worker.choose({'images': [str(image)], 'prompt': 'Choose A: wait, B: defend, C: attack. Reply one letter.',
                'choices': [0, 1, 2], 'feature_path': str(feature_path)})
            sample = {**mx.load(str(feature_path)), 'labels': [0, 1, 2]}
            expected = worker.learner.log_probs(sample)
            actual = mx.array(decision['behavior']['old_log_probs'])
            self.assertTrue(mx.allclose(actual, expected, atol=1e-4).item())
            self.assertTrue(decision['behavior']['adapter_applied_inside_qwen'])
            self.assertEqual(sum(v.size for _, v in tree_flatten(worker.model.trainable_parameters())),
                             4 * (spec['input_size'] + spec['hidden_size']))
            norm = worker.model.language_model.model.norm.original
            base_logits = norm(sample['base']) @ worker.learner.token_rows[:3].astype(mx.float32).T
            base_logp = base_logits - mx.logsumexp(base_logits)
            self.assertGreater(mx.max(mx.abs(expected - base_logp)).item(), 1e-5)
            # Compare with Qwen's actual native full-vocabulary output layer.
            hidden = norm(sample['base'].astype(mx.float32) + worker.learner.adapter(sample['features']))
            language = worker.model.language_model
            native = language.model.embed_tokens.as_linear(hidden) if spec['tied_output'] else language.lm_head(hidden)
            labels = mx.array([token[0] for token in worker.tokens[:3]])
            native = native[labels].astype(mx.float32)
            native = native - mx.logsumexp(native)
            self.assertTrue(mx.allclose(actual, native, atol=1e-3, rtol=1e-4).item())
            sample.update({'chosen': decision['behavior']['chosen'], 'old_log_probs': actual,
                           'version': 0, 'remaining': 0})
            report = worker.learner.train([sample], -1, 'isolated-model-integration')
            self.assertTrue(report['updated'])
            restored = Learner(FinalMLPLoRA(spec['input_size'], spec['hidden_size']), worker.learner.norm_weight,
                               worker.learner.norm_eps, worker.learner.token_rows, str(Path(directory) / 'checkpoints'),
                               spec['identity'], worker.learner.metadata['target'])
            self.assertEqual(weights_digest(restored.adapter), report['after_sha256'])
            self.assertEqual(restored.log_probs(sample).tolist(), worker.learner.log_probs(sample).tolist())


if __name__ == '__main__':
    unittest.main()
