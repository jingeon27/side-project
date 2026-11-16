import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import mlx.core as mx

from clash_bot.qwen import search_data_test as fixtures
from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner, weights_digest
from clash_bot.qwen.runtime import LearningWorker


class IsolatedSearchStudyTest(unittest.TestCase):
    def test_warmup_does_not_train_or_publish_synthetic_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker(directory)
            worker.begin_candidate(worker.directory.parents[1] / "arena/qwen/training/warmup")
            worker.configure_candidate(3)
            metadata = json.loads(json.dumps(worker.learner.metadata))
            pointer = (worker.directory / "current.json").read_bytes()
            self.assertEqual(worker.warmup()["training_samples_added"], 0)
            self.assertTrue(worker.warmup()["already_warm"])
            self.assertEqual(worker.learner.metadata, metadata)
            self.assertEqual((worker.directory / "current.json").read_bytes(), pointer)

    def test_controller_configuration_requires_private_training_and_does_not_change_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker(directory)
            before = worker.status()
            pointer = (worker.directory / "current.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "private"):
                worker.configure_candidate(3)
            worker.begin_candidate(worker.directory.parents[1] / "arena/qwen/training/new")
            with self.assertRaisesRegex(ValueError, "fast controller"):
                worker.configure_candidate(2)
            configured = worker.configure_candidate(3)
            self.assertEqual(configured["controller_version"], 3)
            self.assertEqual(configured["champion_sha256"], before["weights_sha256"])
            self.assertEqual(worker.configure_candidate(3)["version"], configured["version"])
            worker.end_candidate()
            self.assertEqual((worker.directory / "current.json").read_bytes(), pointer)
            self.assertNotIn("controller_version", worker.status())

    def worker(self, directory):
        root = Path(directory) / "data/qwen/learning"
        learner = Learner(
            FinalMLPLoRA(12, 8),
            mx.ones(8),
            1e-6,
            mx.random.normal((3, 8)),
            root,
            "test-model",
            "test.layer",
        )
        sample = {
            "features": mx.ones(12),
            "base": mx.arange(8).astype(mx.float32),
            "labels": [0, 1, 2],
            "version": 0,
            "chosen": 1,
            "remaining": 0,
            "policy_bias": mx.zeros(3),
        }
        sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
        learner.train([sample], 1, "real-baseline")
        worker = object.__new__(LearningWorker)
        worker.directory, worker.learner, worker.evaluation_backup = root, learner, None
        worker.spec = {
            "input_size": 12,
            "hidden_size": 8,
            "identity": learner.metadata["model_sha256"],
            "name": "test-model",
        }
        norm = SimpleNamespace(adapter=learner.adapter)
        worker.model = SimpleNamespace(
            language_model=SimpleNamespace(model=SimpleNamespace(norm=norm))
        )

        def choose(request):
            cached = {**sample, "version": worker.learner.metadata["version"]}
            logp = worker.learner.log_probs(cached)
            path = Path(request["feature_path"])
            path.parent.mkdir(parents=True, exist_ok=True)
            mx.savez(str(path), features=sample["features"], base=sample["base"])
            return {
                "behavior": {
                    "labels": [0, 1, 2],
                    "version": cached["version"],
                    "old_log_probs": logp.tolist(),
                }
            }

        worker.choose = Mock(side_effect=choose)
        return worker

    def test_real_soft_target_gradient_is_private_and_can_be_loaded_for_frozen_evaluation(self):
        mx.random.seed(7)
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker(directory)
            dataset_dir = Path(directory) / "dataset"
            dataset_dir.mkdir()
            path, _ = fixtures.SearchDataTest().write(dataset_dir)
            original = weights_digest(worker.learner.adapter)
            pointer = (worker.directory / "current.json").read_bytes()
            result = worker.study({"dataset": str(path)})
            self.assertTrue(result["updated"])
            self.assertLess(result["cross_entropy_after"], result["cross_entropy_before"])
            self.assertEqual(weights_digest(worker.learner.adapter), original)
            self.assertEqual((worker.directory / "current.json").read_bytes(), pointer)
            self.assertNotEqual(result["candidate_sha256"], original)
            self.assertEqual(worker.study({"dataset": str(path)})["reason"], "already_trained")
            selected = worker.checkout(result["candidate_checkpoint"])
            self.assertTrue(selected["readOnly"])
            self.assertEqual(selected["weights_sha256"], result["candidate_sha256"])
            with self.assertRaisesRegex(ValueError, "Frozen"):
                worker.study({"dataset": str(path)})
            restored = worker.checkout()
            self.assertEqual(restored["weights_sha256"], original)
            self.assertEqual((worker.directory / "current.json").read_bytes(), pointer)

    def test_invalid_distillation_cannot_change_baseline_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker(directory)
            learner = worker.learner
            before = weights_digest(learner.adapter)
            sample = {
                "features": mx.full((12,), float("nan")),
                "base": mx.ones(8),
                "labels": [0, 1, 2],
                "version": learner.metadata["version"],
                "old_log_probs": mx.array([-1.1] * 3),
                "search_target": [0.1, 0.8, 0.1],
            }
            with self.assertRaisesRegex(ValueError, "Nonfinite"):
                learner.distill_search([sample], "bad-features", "rules-a")
            self.assertEqual(weights_digest(learner.adapter), before)


if __name__ == "__main__":
    unittest.main()
