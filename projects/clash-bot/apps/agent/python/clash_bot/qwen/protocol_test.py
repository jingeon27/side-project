import contextlib
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from pydantic import ValidationError

from .learning_worker import serve
from .protocol import parse_inference_request, parse_learning_request


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
            {**self.choice(), "op": "choose_external", "checkpoint": "/private/v000001"},
            {"op": "train", "episode": "/episode"},
            {"op": "train_batch", "episodes": ["/first", "/second"]},
            {"op": "imitate", "dataset": "/dataset.json"},
            {"op": "study", "dataset": "/dataset.json", "candidate": True},
            {"op": "checkout", "checkpoint": None},
            {"op": "begin_candidate", "directory": "/private"},
            {"op": "configure_candidate", "controller_version": 3},
            {"op": "rehearse", "rounds": 4},
            {"op": "promote", "checkpoint": "/private/v000001", "report": "/heldout.json"},
            {
                "op": "observe",
                "images": ["/before.png"],
                "prompt": "observe",
                "schema": {"type": "object"},
                "max_tokens": 160,
            },
        ]
        for request in requests:
            with self.subTest(request=request):
                self.assertEqual(parse_learning_request(json.dumps(request)), request)
        inference = {
            "images": ["/screen.png"],
            "prompt": "classify",
            "schema": {"type": "object"},
            "max_tokens": 160,
        }
        self.assertEqual(parse_inference_request(json.dumps(inference)), inference)

    def test_rejects_invalid_types_bounds_duplicates_and_unknown_operations(self):
        requests = [
            {"op": "unknown"},
            {"op": "status", "train": True},
            {**self.choice(), "choices": [1, 1]},
            {**self.choice(), "choices": ["1"]},
            {**self.choice(), "controller_version": True},
            {**self.choice(), "controller_version": 4},
            {**self.choice(), "op": "choose_external"},
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
