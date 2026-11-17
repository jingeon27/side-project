"""The live TypeScript runtime and this module compute the same features, logits and value."""

import copy
import json
import math
import unittest

import numpy as np

from clash_bot.arena.policy.features import (
    CATALOGUE,
    ENEMY_OUT,
    FIELD,
    HEAD,
    RELATIONS,
    STATE_SIZE,
    TOWERS_KNOWN,
    WEIGHT_SHAPES,
    action_features,
    checksum,
    context_features,
    exported,
    forward,
    hide_towers,
)
from clash_bot.paths import FIXTURES_DIR


def deterministic_weights():
    """Weights both languages can generate without a shared random generator."""
    weights, offset = {}, 0
    for name in sorted(WEIGHT_SHAPES):
        shape = WEIGHT_SHAPES[name]
        size = math.prod(shape)
        values = [((((offset + k) * 7919) % 2003) / 2003 - 0.5) * 0.2 for k in range(size)]
        weights[name] = np.array(values, np.float32).reshape(shape)
        offset += size
    return weights


FIXTURE = json.loads((FIXTURES_DIR / "fast-policy-cases.json").read_text())
CASES = FIXTURE["cases"]


class SharedFastPolicyTest(unittest.TestCase):
    def test_features_logits_and_value_match_the_shared_cases(self):
        weights = deterministic_weights()
        for case in CASES:
            with self.subTest(hand=case["context"]["hand"]):
                state = context_features(case["context"])
                expected = np.zeros(STATE_SIZE, np.float32)
                for index, value in case["features"]:
                    expected[index] = value
                np.testing.assert_allclose(state, expected, atol=1e-6)
                actions = action_features(case["context"])
                np.testing.assert_allclose(actions, case["actionFeatures"], atol=1e-6)
                logits, probabilities, value = forward(weights, state, actions)
                np.testing.assert_allclose(logits, case["logits"], atol=1e-5)
                self.assertAlmostEqual(float(probabilities.sum()), 1, places=5)
                self.assertAlmostEqual(value, case["value"], places=5)

    def test_live_screens_without_tower_hit_points_match_hidden_training_samples(self):
        with_towers = next(case["context"] for case in CASES if case["context"].get("towers"))
        hidden = hide_towers(context_features(with_towers))
        without = context_features({k: v for k, v in with_towers.items() if k != "towers"})
        self.assertEqual(hidden[TOWERS_KNOWN], 0)
        np.testing.assert_array_equal(hidden, without)

    def test_exported_policy_carries_the_checked_weights(self):
        weights = deterministic_weights()
        body = exported(weights, {"version": 3, "rulesID": "rules-a", "catalogue": "c" * 64})
        self.assertEqual(body["weightsSHA256"], checksum(weights))
        self.assertEqual(body["weightsSHA256"], FIXTURE["deterministicWeightsSHA256"])
        restored = {
            name: np.array(item["values"], np.float32).reshape(item["shape"])
            for name, item in body["weights"].items()
        }
        self.assertEqual(checksum(restored), body["weightsSHA256"])
        self.assertEqual(body["stateSize"], STATE_SIZE)


class SeenFieldTest(unittest.TestCase):
    """What v4 reads beyond names: order-free cells, the opponent's cycle and placement relations."""

    context = next(case["context"] for case in CASES if case["context"].get("ownEvolution"))

    def test_body_order_does_not_change_the_cells(self):
        flipped = copy.deepcopy(self.context)
        for side in ("own", "enemy"):
            flipped["bodies"][side].reverse()
        np.testing.assert_array_equal(context_features(flipped), context_features(self.context))

    def test_cards_out_of_the_opponent_hand_are_read(self):
        unknown = {**self.context, "enemyCycle": []}
        state, without = context_features(self.context), context_features(unknown)
        self.assertGreater(float(state[ENEMY_OUT:FIELD].sum()), 0)
        self.assertEqual(float(without[ENEMY_OUT:FIELD].sum()), 0)

    def test_placements_carry_their_relations_and_evolution(self):
        rows = action_features(self.context)
        relation = {
            name: HEAD + CATALOGUE.card_size + index for index, name in enumerate(RELATIONS)
        }
        wait, knight, poison, furnace, skeletons, ability = rows
        self.assertFalse(wait[HEAD - 1 :].any() or ability[HEAD + CATALOGUE.card_size :].any())
        self.assertEqual((knight[HEAD - 1], furnace[HEAD - 1]), (1.0, 0.5))
        # The knight in front of the invader is closer to the threat than the furnace at the back.
        self.assertLess(knight[relation["threatDistance"]], furnace[relation["threatDistance"]])
        # Poison on the push reaches both invaders; a back-row furnace reaches none.
        self.assertEqual(poison[relation["enemiesInReach"]], 0.5)
        self.assertEqual(furnace[relation["enemiesInReach"]], 0.0)
        self.assertEqual((skeletons[relation["leftLane"]], knight[relation["rightLane"]]), (1, 1))


if __name__ == "__main__":
    unittest.main()
