import json
import tempfile
import unittest
from pathlib import Path

import mlx.core as mx

from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner, weights_digest


class LearningPolicyTest(unittest.TestCase):
    def test_worsened_episode_objective_rolls_back_the_update(self):
        from unittest.mock import patch

        from clash_bot.qwen.learning_policy import KLExceeded, clipped_loss

        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            original = weights_digest(learner.adapter)
            calls = []

            def worsened(*args):
                calls.append(True)
                return clipped_loss(*args) + (1 if len(calls) >= 3 else 0)

            with patch("clash_bot.qwen.learning_policy.clipped_loss", side_effect=worsened):
                with self.assertRaisesRegex(KLExceeded, "full episode objective"):
                    learner._train_once([sample], -1, "worse", 3e-5, 0)
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata["version"], 0)

    def test_learning_objectives_do_not_share_adam_momentum(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            self.assertTrue(learner.train([self.sample(learner)], 1, "actor")["updated"])
            actor_optimizer = learner.optimizer
            sample = {
                **self.sample(learner),
                "version": learner.metadata["version"],
                "targets": [1],
                "confidence": 0.95,
                "id": "red",
            }
            self.assertTrue(learner.imitate([sample], "opponent")["updated"])
            self.assertIsNot(actor_optimizer, learner.optimizer)
            self.assertEqual(learner.metadata["optimizer_objective"], "opponent_imitation")
            opponent_optimizer = learner.optimizer
            sample = {**sample, "version": learner.metadata["version"]}
            sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
            self.assertTrue(learner.train([sample], -1, "actor-again")["updated"])
            self.assertIsNot(opponent_optimizer, learner.optimizer)
            self.assertEqual(learner.metadata["optimizer_objective"], "on_policy_ppo")

    def test_opponent_update_rolls_back_if_actor_tactical_anchor_is_degraded(self):
        from unittest.mock import patch

        from clash_bot.qwen.learning_policy import KLExceeded

        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            learner.metadata["controller_version"] = 3
            sample = {**self.sample(learner), "targets": [1], "confidence": 0.95, "id": "opponent"}
            feature = Path(directory) / "features/anchor.npz"
            feature.parent.mkdir()
            mx.savez(str(feature), features=sample["features"], base=sample["base"])
            (Path(directory) / "actor-anchors.json").write_text(
                json.dumps(
                    {
                        "samples": [
                            {"path": str(feature), "labels": [0, 1, 2], "search_target": [0, 1, 0]}
                        ]
                    }
                )
            )
            original = weights_digest(learner.adapter)
            real_log_probs = learner.log_probs
            checks = []

            def measured(row):
                logp = real_log_probs(row)
                if "search_target" in row:
                    checks.append(True)
                    if len(checks) >= 3:
                        return logp + mx.array([0.0, -50.0, 0.0])
                return logp

            with patch.object(learner, "log_probs", side_effect=measured):
                with self.assertRaisesRegex(KLExceeded, "actor tactical anchors"):
                    learner._imitate_once([sample], "opponent", 1e-5, 1e-5, 0)
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata["version"], 0)

    def make_learner(self, directory):
        mx.random.seed(7)
        return Learner(
            FinalMLPLoRA(12, 8),
            mx.ones(8),
            1e-6,
            mx.random.normal((3, 8)),
            directory,
            "test-model",
            "test.layer",
        )

    def sample(self, learner):
        sample = {
            "features": mx.random.normal((12,)),
            "base": mx.random.normal((8,)),
            "labels": [0, 1, 2],
            "chosen": 1,
            "version": 0,
            "remaining": 0,
        }
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
                self.assertGreater(
                    reward * (report["probability_after"] - report["probability_before"]), 0
                )
                reloaded = self.make_learner(directory)
                self.assertEqual(weights_digest(reloaded.adapter), report["after_sha256"])
                self.assertEqual(
                    reloaded.log_probs(sample).tolist(), learner.log_probs(sample).tolist()
                )
                self.assertEqual(reloaded.metadata["version"], 1)
                self.assertEqual(
                    reloaded.train([sample], reward, "episode-1")["reason"], "already_trained"
                )

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
                learner.train([{**sample, "features": mx.full((12,), float("nan"))}], -1, "broken")
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata["version"], 0)

    def test_retries_smaller_steps_after_kl_rollback(self):
        from unittest.mock import patch

        from clash_bot.qwen.learning_policy import KLExceeded

        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            with patch.object(
                learner, "_train_once", side_effect=[KLExceeded(), {"updated": True}]
            ) as update:
                self.assertTrue(learner.train([sample], -1, "retry")["updated"])
                self.assertLess(update.call_args_list[1].args[3], update.call_args_list[0].args[3])

    def test_cannot_load_an_adapter_onto_another_base_model(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            learner.train([self.sample(learner)], -1, "base-a")
            with self.assertRaisesRegex(ValueError, "incompatible"):
                Learner(
                    FinalMLPLoRA(12, 8),
                    mx.ones(8),
                    1e-6,
                    mx.ones((3, 8)),
                    directory,
                    "different-model",
                    "test.layer",
                )

    def test_parallel_games_update_once_with_their_own_rewards_and_checkpoint_both(self):
        from unittest.mock import patch

        from clash_bot.qwen.learning_policy import clipped_loss

        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            advantages = []

            def measured(adapter, sample, advantage, *args):
                advantages.append(advantage)
                return clipped_loss(adapter, sample, advantage, *args)

            games = [
                {"episode": "tab-1", "reward": 1, "samples": [self.sample(learner)]},
                {"episode": "tab-2", "reward": -1, "samples": [self.sample(learner)]},
            ]
            with patch("clash_bot.qwen.learning_policy.clipped_loss", new=measured):
                report = learner.train_batch(games)
            self.assertTrue(report["updated"])
            self.assertGreaterEqual(len(advantages), 2)
            self.assertEqual(advantages, [1, -1] * (len(advantages) // 2))
            self.assertEqual(report["version"], 1)
            self.assertEqual(report["rewards"], [1, -1])
            self.assertEqual(report["selected_per_episode"], {"tab-1": 1, "tab-2": 1})
            restored = self.make_learner(directory)
            self.assertEqual(restored.metadata["episodes"], ["tab-1", "tab-2"])
            self.assertEqual(restored.train_batch(games)["reason"], "already_trained")

    def test_parallel_batch_rejects_mixed_versions_and_partial_replay_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = self.sample(learner)
            original = weights_digest(learner.adapter)
            games = [
                {"episode": "tab-1", "reward": -1, "samples": [sample]},
                {"episode": "tab-2", "reward": 1, "samples": [{**sample, "version": 2}]},
            ]
            with self.assertRaisesRegex(ValueError, "Off-policy"):
                learner.train_batch(games)
            self.assertEqual(weights_digest(learner.adapter), original)
            learner.train([sample], -1, "tab-1")
            current = weights_digest(learner.adapter)
            with self.assertRaisesRegex(ValueError, "Partially trained"):
                learner.train_batch(games)
            self.assertEqual(weights_digest(learner.adapter), current)

    def test_imitation_increases_observed_card_lane_probability_and_reloads(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            sample = {
                **self.sample(learner),
                "id": "observed-furnace",
                "targets": [1, 2],
                "confidence": 0.95,
            }
            report = learner.imitate([sample], "dataset-sha")
            self.assertTrue(report["updated"])
            self.assertEqual(report["algorithm"], "coarse_opponent_behavior_cloning")
            self.assertGreater(report["probability_after"], report["probability_before"])
            self.assertNotEqual(report["before_sha256"], report["after_sha256"])
            self.assertEqual(learner.metadata["baseline"], 0)
            restored = self.make_learner(directory)
            self.assertEqual(weights_digest(restored.adapter), report["after_sha256"])
            self.assertEqual(restored.imitate([sample], "dataset-sha")["reason"], "already_trained")
            self.assertAlmostEqual(float(restored.optimizer.learning_rate.item()), 3e-5, places=10)

    def test_imitation_rejects_unverified_targets_and_restores_nonfinite_update(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = self.make_learner(directory)
            original = weights_digest(learner.adapter)
            sample = {**self.sample(learner), "id": "broken", "targets": [1], "confidence": 0.95}
            with self.assertRaises(ValueError):
                learner.imitate([{**sample, "targets": [10]}], "bad-label")
            with self.assertRaises(ValueError):
                learner.imitate([{**sample, "confidence": 0.5}], "bad-confidence")
            with self.assertRaises(ValueError):
                learner.imitate(
                    [{**sample, "features": mx.full((12,), float("nan"))}], "bad-features"
                )
            self.assertEqual(weights_digest(learner.adapter), original)
            self.assertEqual(learner.metadata["version"], 0)


if __name__ == "__main__":
    unittest.main()
