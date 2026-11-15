import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import mlx.core as mx

from learning_policy import FORMAT, FinalMLPLoRA, weights_digest
from learning_worker import LearningWorker, output_token_rows, verified_result
from model_specs import MODELS
import mlx.nn as nn


class LearningEpisodeTest(unittest.TestCase):
    def test_counterpush_rewards_require_two_identical_visible_crown_labels(self):
        result = {'type': 'result', 'source': 'counterpush_result_dom_verified2', 'blue': 0, 'red': 3,
                  'readings': ['Crowns: you 0, the opponent 3'] * 2}
        self.assertTrue(verified_result(result))
        self.assertFalse(verified_result({**result, 'readings': result['readings'][:1]}))
        self.assertFalse(verified_result({**result, 'blue': 3, 'red': 0}))
    def worker(self):
        worker = object.__new__(LearningWorker)
        worker.spec = MODELS['4b']
        worker.learner = SimpleNamespace(adapter=FinalMLPLoRA(1, 1), train=Mock(return_value={"updated": False}))
        return worker

    def write_episode(self, directory, worker, source="crown_pixels_verified2"):
        directory = Path(directory).resolve()
        features = directory / "features"
        features.mkdir()
        prediction = lambda frame: {"type": "prediction", "image": str(directory / f"{frame:04d}.png"),
            "behavior": {"format": FORMAT, "trainable": True, "labels": [0, 1], "chosen": 0,
                         "old_log_probs": [-0.6, -0.7], "version": 0,
                         "adapter_sha256": weights_digest(worker.learner.adapter),
                         "feature_path": str(features / f"{frame:04d}.npz")}}
        for frame in (1, 3):
            mx.savez(str(features / f"{frame:04d}.npz"), features=mx.zeros(9216), base=mx.zeros(2560))
        rows = [prediction(1), prediction(2), prediction(3),
                {"type": "input_check", "frame": 1, "changed": True, "spent": 3},
                {"type": "input_check", "frame": 2, "changed": False, "spent": 3},
                {"type": "wait_check", "frame": 3, "valid": True},
                {"type": "result", "source": source, "blue": 0, "red": 1, "outcome": "win"}]
        (directory / "events.jsonl").write_text("\n".join(json.dumps(row) for row in rows))

    def test_uses_verified_crowns_and_only_confirmed_actions_or_waits(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker)
            worker.train({"episode": directory})
            samples, reward, episode = worker.learner.train.call_args.args
            self.assertEqual(reward, -1)  # Disregards the incorrect model outcome.
            self.assertEqual(len(samples), 2)
            self.assertEqual(episode, str(Path(directory).resolve()))

    def test_does_not_train_on_a_single_unverified_result_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker, source="crown_pixels")
            self.assertEqual(worker.train({"episode": directory})["reason"], "no_verified_result")
            worker.learner.train.assert_not_called()

    def test_rejects_features_from_a_different_model(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker)
            worker.spec = MODELS['3.8-27b']
            with self.assertRaisesRegex(ValueError, 'different base model'):
                worker.train({'episode': directory})
            worker.learner.train.assert_not_called()

    def test_uses_separate_lm_head_when_embeddings_are_untied(self):
        embedding = nn.Embedding(8, 4)
        embedding.weight = mx.full((8, 4), 2.0)
        head = nn.Linear(4, 8, bias=False)
        head.weight = mx.full((8, 4), 7.0)
        language = SimpleNamespace(model=SimpleNamespace(embed_tokens=embedding), lm_head=head)
        self.assertEqual(output_token_rows(language, mx.array([1, 3]), False).tolist(), [[7.0] * 4] * 2)
        self.assertEqual(output_token_rows(language, mx.array([1, 3]), True).tolist(), [[2.0] * 4] * 2)

    def test_quantized_output_rows_preserve_native_projection_precision(self):
        mx.random.seed(321)
        base = nn.Linear(256, 32, bias=False)
        base.weight = base.weight.astype(mx.bfloat16)
        head = nn.QuantizedLinear.from_linear(base, group_size=64, bits=4)
        language = SimpleNamespace(lm_head=head)
        labels = mx.array([1, 3, 7])
        features = mx.random.normal((256,)).astype(mx.float32)
        rows = output_token_rows(language, labels, False)
        self.assertTrue(mx.allclose(rows @ features, head(features)[labels], atol=1e-5, rtol=1e-5).item())

    def test_imitation_uses_only_before_frame_and_maps_macro_labels_without_reward(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            worker.learner.metadata = {'version': 3, 'demonstrations': []}
            worker.learner.imitate = Mock(return_value={'updated': True, 'version': 4})
            observation = {'id': 'red-support', 'image': 'images/before.png',
                           'evidence_image': 'images/after.png', 'prompt': 'Predict the next card.',
                           'choices': [7, 2, 9], 'target_ids': [2, 9], 'confidence': 0.95}
            def choose(request):
                feature_path = Path(request['feature_path'])
                feature_path.parent.mkdir(parents=True)
                mx.savez(str(feature_path), features=mx.ones(12), base=mx.ones(8))
                return {'behavior': {'labels': [0, 1, 2], 'version': 3,
                                     'old_log_probs': [-1.1, -1.1, -1.1]}}
            worker.choose = Mock(side_effect=choose)
            path = Path(directory) / 'dataset.json'
            with patch('learning_worker.load_demonstrations', return_value=({'samples': [observation]}, 'digest', path)):
                report = worker.imitate({'dataset': str(path)})
            self.assertTrue(report['updated'])
            self.assertEqual(worker.choose.call_args.args[0]['images'], [str(path.parent / 'images/before.png')])
            samples, identity = worker.learner.imitate.call_args.args
            self.assertEqual(samples[0]['targets'], [1, 2])
            self.assertEqual(identity, 'digest')
            worker.learner.train.assert_not_called()


if __name__ == "__main__":
    unittest.main()
