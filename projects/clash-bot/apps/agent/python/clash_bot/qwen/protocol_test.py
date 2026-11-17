import contextlib
import io
import json
import subprocess
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from pydantic import ValidationError

from .learning_worker import serve
from .protocol import parse_learning_request


class WorkerProtocolTests(unittest.TestCase):
    def choice(self):
        return {
            "op": "choose",
            "images": [],
            "prompt": "public state",
            "choices": [0, 7],
            "feature_path": "/private/0001.npz",
            "controller_version": 3,
        }

    def test_existing_commands_keep_their_wire_shape_and_schema_alias(self):
        requests = [
            {"op": "status"},
            {"op": "warmup"},
            {"op": "end_candidate"},
            self.choice(),
            {"op": "train", "episode": "/episode"},
            {"op": "train_batch", "episodes": ["/first", "/second"]},
            {"op": "imitate", "dataset": "/dataset.json"},
            {"op": "study", "dataset": "/dataset.json", "candidate": True},
            {"op": "checkout", "checkpoint": None},
            {"op": "begin_candidate", "directory": "/private"},
            {"op": "configure_candidate", "controller_version": 3},
            {"op": "rehearse", "rounds": 4},
            {"op": "promote", "checkpoint": "/private/v000001", "report": "/heldout.json"},
        ]
        for request in requests:
            with self.subTest(request=request):
                self.assertEqual(parse_learning_request(json.dumps(request)), request)

    def test_rejects_invalid_types_bounds_duplicates_and_unknown_operations(self):
        requests = [
            {"op": "unknown"},
            {"op": "status", "train": True},
            {**self.choice(), "choices": [1, 1]},
            {**self.choice(), "choices": ["1"]},
            {**self.choice(), "controller_version": True},
            {**self.choice(), "controller_version": 4},
            {**self.choice(), "op": "choose_external"},
            {**self.choice(), "checkpoint": "/private/v000001"},
            {"op": "observe", "images": ["/before.png"], "prompt": "observe", "schema": {}},
            {"op": "train_batch", "episodes": ["/same", "/same"]},
            {"op": "train_batch", "episodes": ["/one", "/two", "/three"]},
            {"op": "rehearse", "rounds": 65},
            {"op": "promote", "checkpoint": "/private"},
        ]
        for request in requests:
            with self.subTest(request=request):
                with self.assertRaises(ValidationError):
                    parse_learning_request(json.dumps(request))

    def test_bad_json_does_not_desynchronize_the_next_response(self):
        worker = SimpleNamespace(
            evaluation_backup=None,
            candidate_active=lambda: True,
            status=Mock(return_value={"version": 7}),
        )
        replies = []
        with contextlib.redirect_stderr(io.StringIO()):
            serve(worker, ["{", '{"op":"unknown"}', '{"op":"status"}'], replies.append)
        self.assertEqual([row["type"] for row in replies], ["error", "error", "result"])
        self.assertEqual(replies[-1]["version"], 7)
        worker.status.assert_called_once()

    def test_typed_requests_cannot_bypass_frozen_or_deployed_model_guards(self):
        worker = SimpleNamespace(
            evaluation_backup={"frozen": True},
            candidate_active=lambda: False,
            train=Mock(),
        )
        request = json.dumps({"op": "train", "episode": "/episode"})
        replies = []
        with contextlib.redirect_stderr(io.StringIO()):
            serve(worker, [request], replies.append)
            worker.evaluation_backup = None
            serve(worker, [request], replies.append)
        self.assertEqual([row["type"] for row in replies], ["error", "error"])
        worker.train.assert_not_called()

    def test_the_worker_process_keeps_model_output_off_the_reply_channel(self):
        # The real entry point with a stand-in model that writes to stdout both ways.
        script = "\n".join(
            [
                "import os, sys, types",
                "class LearningWorker:",
                "    evaluation_backup = None",
                "    def __init__(self, model, data):",
                "        os.write(1, b'native model log\\n')",
                "        print('python model log', flush=True)",
                "        self.learner = types.SimpleNamespace(metadata={'version': 7}, adapter=None)",
                "    def candidate_active(self):",
                "        return False",
                "    def status(self):",
                "        os.write(1, b'native status log\\n')",
                "        return {'version': 7}",
                "runtime = types.ModuleType('clash_bot.qwen.worker.runtime')",
                "runtime.LearningWorker = LearningWorker",
                "policy = types.ModuleType('clash_bot.qwen.learning.learning_policy')",
                "policy.weights_digest = lambda adapter: 'digest'",
                "mlx, core = types.ModuleType('mlx'), types.ModuleType('mlx.core')",
                "mlx.core, core.get_peak_memory = core, lambda: 0",
                "sys.modules.update({'mlx': mlx, 'mlx.core': core})",
                "sys.modules.update({runtime.__name__: runtime, policy.__name__: policy})",
                "sys.argv = ['worker', 'model', 'data']",
                "from clash_bot.qwen.learning_worker import main",
                "main()",
            ]
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            input='{"op":"status"}\n{\n',
            capture_output=True,
            text=True,
            check=True,
        )
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([row["type"] for row in replies], ["ready", "result", "error"])
        self.assertEqual((replies[0]["weights_sha256"], replies[1]["version"]), ("digest", 7))
        for log in ("native model log", "python model log", "native status log"):
            self.assertIn(log, result.stderr)
