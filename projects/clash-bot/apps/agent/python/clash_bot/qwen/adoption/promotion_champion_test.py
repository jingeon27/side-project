import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.adoption.promotion_fixture import fixture
from clash_bot.qwen.learning.learning_policy import weights_digest


class ChampionPromotionTest(unittest.TestCase):
    def test_full_raw_evidence_publishes_once_reloads_and_keeps_the_previous_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, report = fixture(directory)
            previous = weights_digest(worker.learner.adapter)
            old_file = worker.directory / "checkpoints/v000001/adapter.safetensors"
            old_bytes = old_file.read_bytes()
            result = worker.promote({"checkpoint": str(checkpoint), "report": str(path)})
            self.assertTrue(result["promoted"])
            self.assertEqual(
                worker.status()["weights_sha256"], report["candidate"]["weights_sha256"]
            )
            self.assertNotEqual(worker.status()["weights_sha256"], previous)
            self.assertEqual(old_file.read_bytes(), old_bytes)
            self.assertEqual(worker.status()["role"], "champion")
            self.assertEqual(
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})["reason"],
                "already_applied",
            )
            root = worker.directory.parents[1] / "arena/qwen/training/next"
            private = worker.begin_candidate(str(root))
            self.assertEqual(
                private["candidate_parent_sha256"], report["candidate"]["weights_sha256"]
            )
            self.assertEqual(
                worker.end_candidate()["weights_sha256"], report["candidate"]["weights_sha256"]
            )

    def test_direct_training_of_a_guarded_champion_rolls_back_and_a_private_candidate_can_train(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, _ = fixture(directory)
            learner = worker.learner
            sample = {
                "features": mx.ones(12),
                "base": mx.arange(8).astype(mx.float32),
                "labels": [0, 1, 2],
                "version": learner.metadata["version"],
                "chosen": 1,
                "remaining": 0,
                "policy_bias": mx.zeros(3),
            }
            sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
            original = weights_digest(learner.adapter)
            with self.assertRaisesRegex(ValueError, "frozen"):
                learner.train([sample], 1, "unqualified-update")
            self.assertEqual(weights_digest(learner.adapter), original)
            worker.begin_candidate(str(checkpoint.parents[1]))
            with self.assertRaisesRegex(ValueError, "Restore"):
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})
            self.assertEqual(worker.end_candidate()["weights_sha256"], original)


if __name__ == "__main__":
    unittest.main()
