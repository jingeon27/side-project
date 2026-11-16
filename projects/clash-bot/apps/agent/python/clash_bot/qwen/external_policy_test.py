import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import Mock

import mlx.core as mx

from clash_bot.qwen.external_policy import choose_external
from clash_bot.qwen.learning_policy import FORMAT, FinalMLPLoRA, weights_digest


class ExternalPolicyTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        checkpoint = root / 'arena/qwen/training/private/checkpoints/v000001'
        checkpoint.mkdir(parents=True)
        adapter = FinalMLPLoRA(1, 1)
        adapter.save_weights(str(checkpoint / 'adapter.safetensors'))
        metadata = {'version': 1, 'format': FORMAT, 'model_sha256': 'test', 'controller_version': 3,
                    'weights_sha256': weights_digest(adapter), 'target': 'last.mlp'}
        (checkpoint / 'metadata.json').write_text(json.dumps(metadata))
        original = SimpleNamespace(adapter=FinalMLPLoRA(1, 1), norm_weight=mx.ones(1), norm_eps=1e-6, token_rows=mx.ones((26, 1)))
        worker = SimpleNamespace(directory=root / 'qwen/learning', evaluation_backup=None,
                                 candidate_active=lambda: True, learner=original,
                                 spec={'identity': 'test', 'input_size': 1, 'hidden_size': 1})
        worker.bind = lambda learner: setattr(worker, 'learner', learner)
        worker.choose = Mock(side_effect=lambda request: {'choice': 0, 'behavior': {'trainable': True, 'adapter_sha256': weights_digest(worker.learner.adapter)}})
        return worker, {'checkpoint': str(checkpoint), 'controller_version': 3}, original

    def test_shared_backbone_restores_active_learner_and_never_writes_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, request, original = self.fixture(directory)
            files = {str(p): p.read_bytes() for p in Path(directory).rglob('*') if p.is_file()}
            result = choose_external(worker, request)
            self.assertIs(worker.learner, original)
            self.assertFalse(result['behavior']['trainable'])
            self.assertTrue(result['behavior']['read_only_external'])
            self.assertEqual(result['behavior']['source'], 'bluestacks_trophy')
            self.assertEqual(files, {str(p): p.read_bytes() for p in Path(directory).rglob('*') if p.is_file()})
            self.assertNotEqual(id(worker.external_policy['learner']), id(original))

    def test_inference_failure_also_restores_the_training_adapter(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, request, original = self.fixture(directory)
            worker.choose.side_effect = RuntimeError('inference failed')
            with self.assertRaisesRegex(RuntimeError, 'inference failed'):
                choose_external(worker, request)
            self.assertIs(worker.learner, original)

    def test_qualification_foreign_path_and_corrupt_snapshot_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, request, _ = self.fixture(directory)
            worker.evaluation_backup = {'active': True}
            with self.assertRaisesRegex(ValueError, 'qualification'):
                choose_external(worker, request)
            worker.evaluation_backup = None
            with self.assertRaisesRegex(ValueError, 'owned private'):
                choose_external(worker, {**request, 'checkpoint': directory})
            path = Path(request['checkpoint']) / 'metadata.json'
            metadata = json.loads(path.read_text())
            path.write_text(json.dumps({**metadata, 'weights_sha256': 'corrupt'}))
            with self.assertRaisesRegex(ValueError, 'checksum'):
                choose_external(worker, request)
            worker.choose.assert_not_called()


if __name__ == '__main__':
    unittest.main()
