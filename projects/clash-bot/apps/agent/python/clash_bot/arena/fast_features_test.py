"""The live TypeScript runtime and this module compute the same features, logits and value."""

import json
import math
import unittest

import numpy as np

from clash_bot.arena.fast_features import (
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
        body = exported(weights, {"version": 3, "rulesID": "rules-a"})
        self.assertEqual(body["weightsSHA256"], checksum(weights))
        self.assertEqual(body["weightsSHA256"], FIXTURE["deterministicWeightsSHA256"])
        restored = {
            name: np.array(item["values"], np.float32).reshape(item["shape"])
            for name, item in body["weights"].items()
        }
        self.assertEqual(checksum(restored), body["weightsSHA256"])
        self.assertEqual(body["stateSize"], STATE_SIZE)


if __name__ == "__main__":
    unittest.main()
