import tempfile
import unittest

import mlx.core as mx

from learning_policy import FinalMLPLoRA, Learner, weights_digest


class LearningPolicyTest(unittest.TestCase):
    def make_learner(self, directory):
        mx.random.seed(7)
        return Learner(FinalMLPLoRA(12, 8), mx.ones(8), 1e-6, mx.random.normal((3, 8)), directory)

    def sample(self, learner):
        sample = {"features": mx.random.normal((12,)), "base": mx.random.normal((8,)),
                  "labels": [0, 1, 2], "chosen": 1, "version": 0, "remaining": 0}
        sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
        mx.eval(sample["old_log_probs"])
        return sample

    def test_rewards_change_weights_in_opposite_directions_and_reload_exactly(self):
        for reward in (-1, 1):
            with self.subTest(reward=reward), tempfile.TemporaryDirectory() as directory:
                learner = self.make_learner(directory)
                sample = self.sample(learner)
                report = learner.train([sample], reward, "episode-1")
                self.assertTrue(report["updated"])
                self.assertNotEqual(report["before_sha256"], report["after_sha256"])
                self.assertGreater(reward * (report["probability_after"] - report["probability_before"]), 0)
                reloaded = self.make_learner(directory)
                self.assertEqual(weights_digest(reloaded.adapter), report["after_sha256"])
                self.assertEqual(reloaded.log_probs(sample).tolist(), learner.log_probs(sample).tolist())
                self.assertEqual(reloaded.metadata["version"], 1)
                self.assertEqual(reloaded.train([sample], reward, "episode-1")["reason"], "already_trained")

    def test_rejects_off_policy_or_unknown_reward_without_changing_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            original = weights_digest(learner.adapter)
            self.assertFalse(learner.train([sample], None, "unverified")["updated"])
            with self.assertRaisesRegex(ValueError, "Off-policy"):
                learner.train([{**sample, "version": 4}], -1, "old-policy")
            self.assertEqual(weights_digest(learner.adapter), original)

    def test_rolls_back_nonfinite_update_without_publishing_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            original = weights_digest(learner.adapter)
            with self.assertRaises(ValueError):
                learner.train([{**sample, "features": mx.full((12,), float('nan'))}], -1, "broken")
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata["version"], 0)

    def test_retries_smaller_steps_after_kl_rollback(self):
        from unittest.mock import patch
        from learning_policy import KLExceeded
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            with patch.object(learner, '_train_once', side_effect=[KLExceeded(), {"updated": True}]) as update:
                self.assertTrue(learner.train([sample], -1, 'retry')["updated"])
                self.assertLess(update.call_args_list[1].args[3], update.call_args_list[0].args[3])

    def test_cannot_load_an_adapter_onto_another_base_model(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            learner.train([self.sample(learner)], -1, 'base-a')
            with self.assertRaisesRegex(ValueError, 'incompatible'):
                Learner(FinalMLPLoRA(12, 8), mx.ones(8), 1e-6, mx.ones((3, 8)), directory,
                        model_identity='different-model')

    def test_imitation_increases_observed_card_lane_probability_and_reloads(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = {**self.sample(learner), 'id': 'observed-furnace', 'targets': [1, 2], 'confidence': 0.95}
            report = learner.imitate([sample], 'dataset-sha')
            self.assertTrue(report['updated'])
            self.assertEqual(report['algorithm'], 'coarse_opponent_behavior_cloning')
            self.assertGreater(report['probability_after'], report['probability_before'])
            self.assertNotEqual(report['before_sha256'], report['after_sha256'])
            self.assertEqual(learner.metadata['baseline'], 0)
            restored = self.make_learner(directory)
            self.assertEqual(weights_digest(restored.adapter), report['after_sha256'])
            self.assertEqual(restored.imitate([sample], 'dataset-sha')['reason'], 'already_trained')
            self.assertAlmostEqual(float(restored.optimizer.learning_rate.item()), 3e-5, places=10)

    def test_imitation_rejects_unverified_targets_and_restores_nonfinite_update(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            original = weights_digest(learner.adapter)
            sample = {**self.sample(learner), 'id': 'broken', 'targets': [1], 'confidence': 0.95}
            with self.assertRaises(ValueError):
                learner.imitate([{**sample, 'targets': [10]}], 'bad-label')
            with self.assertRaises(ValueError):
                learner.imitate([{**sample, 'confidence': 0.5}], 'bad-confidence')
            with self.assertRaises(ValueError):
                learner.imitate([{**sample, 'features': mx.full((12,), float('nan'))}], 'bad-features')
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata['version'], 0)


if __name__ == "__main__":
    unittest.main()
