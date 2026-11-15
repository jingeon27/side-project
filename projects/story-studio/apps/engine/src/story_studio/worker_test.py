"""Durable worker contract tests; no model dependencies or downloads required."""
import json
from pathlib import Path
import tempfile
import unittest

from . import worker
from .voice_job import atomic_json


class WorkerStatusTests(unittest.TestCase):
    def tearDown(self):
        worker.STATE.clear()

    def test_training_success_clears_error_and_preserves_checkpoint_without_null_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run_id = 'local-29edf583-4d34-4b0a-99e4-9f66bf1c6400'
            folder = root / 'voice-training/runs' / run_id
            atomic_json(folder / 'status.json', {'id': run_id, 'voiceId': '29edf583-4d34-4b0a-99e4-9f66bf1c6400', 'status': 'RUNNING', 'step': 1, 'total': 6, 'error': 'previous failure'})
            (folder / 'checkpoints/step-000006').mkdir(parents=True)
            (folder / 'checkpoints/latest').write_text('step-000006')
            worker.STATE.update(root=root, taskId=run_id, training=True)
            worker.save_task('SUCCEEDED', step=6, error=None)
            result = json.loads((folder / 'status.json').read_text())
            self.assertNotIn('error', result)
            self.assertEqual(result['checkpoint'], 'step-000006')
            self.assertEqual(result['step'], result['total'])
            self.assertFalse(list(folder.glob('*.partial')))


if __name__ == '__main__':
    unittest.main()
