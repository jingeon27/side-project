import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.action_prior import action_prior
from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner


class ActionPriorTest(unittest.TestCase):
    def test_empty_poison_is_not_rewarded_by_a_possible_movement_upper_bound(self):
        state = "mana=6;enemyMana=0-10;own=;enemy=I1.6,14.5;effects=;towers=?\n"
        empty = action_prior(state + "A:P3.5,25.9d0-184k0?e0-1.7n0 B:W", 2)
        hit = action_prior(state + "A:P3.5,25.9d0-184k0?e0-1.7n184 B:W", 2)
        self.assertLess(empty[0], hit[0] - 5)

    def test_king_guard_uses_known_tower_state_and_does_not_treat_unknown_as_awake(self):
        state = "mana=10;enemyMana=0-10;own=;enemy=;effects=;towers="
        unknown = action_prior(state + "?\nA:P9,27n736 B:P3.5,25.5n736", 2)
        awake = action_prior(state + "1,1,1|0.9,1,1\nA:P9,27n736 B:P3.5,25.5n736", 2)
        self.assertLess(unknown[0], unknown[1] - 6)
        self.assertAlmostEqual(awake[0], awake[1])

    def test_hut_does_not_spend_early_or_repeat_existing_coverage_without_a_threat(self):
        actions = "\nA:H9,11 B:W"
        early = action_prior("mana=4;enemy=;own=;effects=" + actions, 2)
        full = action_prior("mana=10;enemy=;own=;effects=" + actions, 2)
        duplicate = action_prior("mana=10;enemy=;own=H9,10;effects=" + actions, 2)
        self.assertLess(early[0], full[0])
        self.assertLess(duplicate[0], full[0])

    def test_poison_reserves_defense_and_does_not_stack_an_active_cast(self):
        state = "mana=4;enemyMana=0-10;own=;enemy=;effects="
        defend = action_prior(state + "rG3.5,6.5@2s\nA:P3.5,6.5zn0 B:P14.5,25.5zn0", 2)
        self.assertGreater(defend[0], defend[1] + 5)
        stacked = action_prior(state + "bP3.5,6.5@2s\nA:P3.5,6.5n184 B:P14.5,25.5n184", 2)
        self.assertLess(stacked[0], stacked[1] - 5)

    def test_graveyard_uses_tank_mana_and_enemy_poison_cycle_together(self):
        state = "mana=5;enemyMana=4-8;hand=GPIK;effects=;enemyCycle="
        ready = action_prior(state + "P0-0;own=\nA:G3.5,25.5 B:W", 2)
        cycled = action_prior(state + "P4-4 I3-3 H2-2;own=\nA:G3.5,25.5 B:W", 2)
        tank = action_prior(state + "P0-0;own=K3.5,21\nA:G3.5,25.5 B:W", 2)
        self.assertLess(ready[0], cycled[0])
        self.assertLess(ready[0], tank[0])

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
