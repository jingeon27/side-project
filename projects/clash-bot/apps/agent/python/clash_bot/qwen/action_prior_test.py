import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.action_prior import action_prior
from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner


class ActionPriorTest(unittest.TestCase):
    def test_drill_emergence_reserves_skeletons_and_prefers_nearby_knight(self):
        state = "mana=3;enemyMana=0-10;own=;enemy=;effects=;emergence=2,6.5;drill=?\n"
        prior = action_prior(state + "A:W B:K2,6.8 C:K8,0.5 D:S2,6.8 E:B2,5q0r0", 5)
        self.assertGreater(prior[1], prior[0] + 4)
        self.assertLess(prior[3], prior[0] - 8)
        active = action_prior(
            "mana=3;enemyMana=0-10;own=;enemy=d2,6.5;effects=;drill=2,6.5@emerged\nA:W B:S2,6.8 C:G3.5,25.5",
            3,
        )
        emerging = action_prior(
            "mana=3;enemyMana=0-10;own=;enemy=d2,6.5;effects=;drill=2,6.5@emerging\nA:W B:S2,6.8 C:G3.5,25.5",
            3,
        )
        self.assertGreater(active[1], emerging[1] + 8)
        self.assertLess(active[2], active[0] - 6)

    def test_unanswered_graveyard_prefers_defense_over_attack_and_rear_buildup(self):
        prior = action_prior(
            "mana=5;enemyMana=0-10;own=;enemy=s3.5,6;effects=rG3.5,6.5@2s\nA:W B:P3.5,6.5n0 C:P14.5,25.5n0 D:I3.5,7 E:I8,0.5 F:G14.5,25.5",
            6,
        )
        self.assertGreater(prior[1], prior[2] + 5)
        self.assertGreater(prior[3], prior[4] + 5)
        self.assertLess(prior[5], prior[0] - 8)

    def test_graveyard_poison_followup_needs_targets_and_defense_reserve(self):
        def cast(mana, potential):
            return action_prior(
                f"mana={mana};enemyMana=0-10;own=;enemy=I3.5,25;effects=bG3.5,25.5@3s\nA:P3.5,25.5n{potential} B:W",
                2,
            )[0]

        self.assertGreater(cast(8, 184), cast(4, 184) + 3)
        self.assertGreater(cast(8, 184), cast(8, 0) + 4)

    def test_conserve_on_confirmed_or_possible_elixir_deficit_but_keep_close_defense(self):
        low = action_prior("mana=4;enemyMana=7-10;own=;enemy=;effects=\nA:F8,0.5 B:K8,0.5 C:W", 3)
        even = action_prior("mana=9;enemyMana=0-4;own=;enemy=;effects=\nA:F8,0.5 B:K8,0.5 C:W", 3)
        defense = action_prior(
            "mana=4;enemyMana=7-10;own=;enemy=?3.5,7;effects=\nA:F3.5,7 B:K3.5,7 C:W", 3
        )
        self.assertLess(low[0], even[0] - 8)
        self.assertGreater(defense[1], low[1] + 8)

    def test_unknown_counter_is_not_treated_as_confirmed_and_low_mana_buildup_waits(self):
        actions = "\nA:G3.5,25.5 B:W"
        state = "mana=5;enemyMana=4-8;hand=GIKS;own=;enemy=;effects=;enemyCycle="
        unknown = action_prior(state + "?" + actions, 2)
        ready = action_prior(state + "P0-0" + actions, 2)
        self.assertGreater(unknown[0], ready[0])
        build = "\nA:F8,0.5 B:K10,0.5 C:W"
        poor = action_prior("mana=5;enemy=;own=;effects=" + build, 3)
        rich = action_prior("mana=10;enemy=;own=;effects=" + build, 3)
        self.assertLess(poor[0], rich[0] - 3)
        self.assertLess(poor[1], rich[1] - 3)
        defense = action_prior("mana=5;enemy=?3.5,8;own=;effects=" + build, 3)
        self.assertGreater(defense[0], poor[0])

    def test_empty_poison_is_not_rewarded_by_a_possible_movement_upper_bound(self):
        state = "mana=6;enemyMana=0-10;own=;enemy=I1.6,14.5;effects=;towers=?\n"
        empty = action_prior(state + "A:P3.5,25.9d0-368k0?e0-4n0 B:W", 2)
        hit = action_prior(state + "A:P3.5,25.9d0-368k0?e0-4n368 B:W", 2)
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
        distant = action_prior("mana=4;enemy=K3.5,25;own=;effects=" + actions, 2)
        full = action_prior("mana=10;enemy=;own=;effects=" + actions, 2)
        duplicate = action_prior("mana=10;enemy=;own=H9,10;effects=" + actions, 2)
        self.assertLess(early[0], full[0])
        self.assertEqual(distant[0], early[0])
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
