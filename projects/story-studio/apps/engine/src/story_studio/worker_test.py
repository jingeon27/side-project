"""Exercise the process protocol and cleanup without model dependencies."""
import contextlib
import io
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import unittest
from unittest.mock import patch

from . import worker
from .storage import atomic_json


class WorkerLifecycleTests(unittest.TestCase):
    def test_generation_keeps_diagnostics_out_of_json_and_releases_active_marker(self):
        def generate(root, request, progress):
            print('model diagnostic')
            progress('한국어 음성을 준비합니다')
            return {'asset': '/api/assets/example.wav', 'duration': 2}

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            protocol, diagnostics = io.StringIO(), io.StringIO()
            arguments = ['story_studio', '--data-dir', str(root), '--examples-dir', str(root / 'examples')]
            with patch.object(sys, 'argv', arguments), patch.object(sys, 'stdin', io.StringIO('{"action":"voice"}')), patch.object(worker, 'generate_voice', generate), patch.object(signal, 'signal'), patch.object(os, 'nice'), patch.dict(os.environ), contextlib.redirect_stdout(protocol), contextlib.redirect_stderr(diagnostics):
                worker.run_cli()
            events = [json.loads(line) for line in protocol.getvalue().splitlines()]
            self.assertEqual(events[-1]['result'], {'asset': '/api/assets/example.wav', 'duration': 2})
            self.assertTrue(any(event.get('progress') == '한국어 음성을 준비합니다' for event in events))
            self.assertIn('model diagnostic', diagnostics.getvalue())
            self.assertFalse((root / 'local/active.json').exists())

    def test_voice_coverage_errors_are_actionable_but_unexpected_errors_stay_private(self):
        from .generation.verified_speech import IncompleteSpeechError
        for error in [IncompleteSpeechError('대사를 확인하지 못했습니다. 다시 시도해 주세요.'), RuntimeError('private-internal-detail')]:
            with self.subTest(error=type(error).__name__), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                protocol = io.StringIO()
                arguments = ['story_studio', '--data-dir', str(root), '--examples-dir', str(root / 'examples')]
                with patch.object(sys, 'argv', arguments), patch.object(sys, 'stdin', io.StringIO('{"action":"voice"}')), patch.object(worker, 'generate_voice', side_effect=error), patch.object(signal, 'signal'), patch.object(os, 'nice'), patch.dict(os.environ), contextlib.redirect_stdout(protocol), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                    worker.run_cli()
                result = json.loads(protocol.getvalue().splitlines()[-1])
                if isinstance(error, IncompleteSpeechError):
                    self.assertEqual(result['error'], str(error))
                else:
                    self.assertNotIn('private-internal-detail', result['error'])
                self.assertFalse((root / 'local/active.json').exists())

    def test_training_cancellation_preserves_checkpoint_and_reports_cancelled(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run_id = 'local-29edf583-4d34-4b0a-99e4-9f66bf1c6400'
            folder = root / 'voice-training/runs' / run_id
            atomic_json(folder / 'status.json', {'id': run_id, 'status': 'RUNNING', 'step': 5, 'total': 10})
            (folder / 'checkpoints/step-000005').mkdir(parents=True)
            (folder / 'checkpoints/latest').write_text('step-000005')
            handlers = {}

            def register(signum, handler):
                handlers[signum] = handler

            def cancel(*arguments):
                handlers[signal.SIGTERM](signal.SIGTERM, None)

            arguments = ['story_studio', '--data-dir', str(root), '--examples-dir', str(root / 'examples')]
            request = json.dumps({'action': 'train-voice', 'runId': run_id, 'taskId': run_id})
            protocol = io.StringIO()
            with patch.object(sys, 'argv', arguments), patch.object(sys, 'stdin', io.StringIO(request)), patch.object(worker, 'train', cancel), patch.object(signal, 'signal', register), patch.object(os, 'nice'), patch.dict(os.environ), contextlib.redirect_stdout(protocol), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ended:
                worker.run_cli()
            self.assertEqual(ended.exception.code, 1)
            result = json.loads((folder / 'status.json').read_text())
            self.assertEqual(result['status'], 'CANCELLED')
            self.assertEqual(result['checkpoint'], 'step-000005')
            self.assertEqual(result['step'], 5)
            self.assertFalse((root / 'local/active.json').exists())
            self.assertIn('error', json.loads(protocol.getvalue().splitlines()[-1]))


if __name__ == '__main__':
    unittest.main()
