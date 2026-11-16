import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.action_prior import action_prior
from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner


class ActionPriorTest(unittest.TestCase):
    def test_five_positions_do_not_outvote_one_wait_action(self):
        bias = action_prior("mana=6\nA:B1,1 B:B2,1 C:B3,1 D:B4,1 E:B5,1 F:W", 6)
        probabilities = mx.softmax(mx.array(bias)).tolist()
        self.assertAlmostEqual(sum(probabilities[:5]), probabilities[5], places=6)

    def test_targetless_skill_is_not_a_repeated_fifty_fifty_draw(self):
        probabilities = mx.softmax(mx.array(action_prior("mana=2\nA:Uq0 B:W", 2))).tolist()
        self.assertLess(probabilities[0], 0.001)
        valid = mx.softmax(mx.array(action_prior("mana=2\nA:Uq1 B:W", 2))).tolist()
        self.assertAlmostEqual(valid[0], 0.5)

    def test_reserved_barrel_and_empty_roll_are_distinct(self):
        reserved = action_prior("mana=2\nA:B3,6q0r1 B:W", 2)
        empty = action_prior("mana=2\nA:B3,6q0r0 B:W", 2)
        productive = action_prior("mana=2\nA:B3,6q2r1 B:W", 2)
        self.assertLess(reserved[0], empty[0])
        self.assertEqual(productive[0], 0)

    def test_ppo_scores_and_gradients_use_the_executed_prior(self):
        with tempfile.TemporaryDirectory() as directory:
            learner = Learner(
                FinalMLPLoRA(12, 8),
                mx.ones(8),
                1e-6,
                mx.random.normal((26, 8)),
                directory,
                "model",
                "layer",
            )
            sample = {
                "features": mx.ones(12),
                "base": mx.ones(8),
                "labels": [0, 1],
                "policy_bias": mx.array([-3.0, 0.0]),
                "chosen": 1,
                "version": 0,
                "remaining": 0,
            }
            sample["old_log_probs"] = mx.stop_gradient(learner.policy_log_probs(sample))
            self.assertGreater(
                mx.max(mx.abs(learner.log_probs(sample) - sample["old_log_probs"])).item(), 1
            )
            report = learner.train([sample], 1, "with-public-prior")
            self.assertTrue(report["updated"])
            self.assertGreater(report["probability_after"], report["probability_before"])

    def test_malformed_action_order_is_rejected(self):
        with self.assertRaises(ValueError):
            action_prior("A:W C:Uq0", 2)
