import unittest

import numpy as np

from clash_bot.arena.policy.dense import DenseActions
from clash_bot.arena.policy.features import ACTION_SIZE, WEIGHT_SHAPES, checksum
from clash_bot.arena.policy.learning_spec import SPEC
from clash_bot.arena.policy.samples import TrainingSample
from clash_bot.arena.policy.update import bounded_update, log_probabilities


class ConservativeUpdateTest(unittest.TestCase):
    def test_nonfinite_proposal_is_rejected_before_a_probe_or_weight_is_changed(self):
        before = {"query.bias": np.zeros(1, np.float32)}
        with self.assertRaisesRegex(ValueError, "Nonfinite"):
            bounded_update(before, {"query.bias": np.array([float("nan")])}, [], 1)
        np.testing.assert_array_equal(before["query.bias"], [0])

    def test_large_shared_encoder_actor_update_is_bounded_on_both_dense_views(self):
        vectors = np.array([[0] * ACTION_SIZE, [1] * ACTION_SIZE, [0.5] * ACTION_SIZE], np.float32)
        source = DenseActions.pack(vectors, [-1, 3, 3], [0, 0.2, -0.1], [1, -0.1, 0.2], [0, 1])
        row = TrainingSample.model_validate(
            {
                "features": {"index": [1], "value": [0.7]},
                "actions": [[-1, 0, 0], [3, 1, 1]],
                "actionFeatures": vectors[:2].tolist(),
                "actionBias": [0, 0.2],
                "actionBiasWithoutTowers": [1, -0.1],
                "source": source.model_dump(),
                "target": [0.4, 0.6],
                "targetWithoutTowers": [0.6, 0.4],
                "defensePairs": [[2, 1]],
                "outcome": -1,
                "value": -0.6,
            }
        )
        rng = np.random.default_rng(1)
        base = {
            name: rng.normal(0, 0.04, shape).astype(np.float32)
            for name, shape in WEIGHT_SHAPES.items()
        }
        identity = checksum(base)
        proposed = {name: value.copy() for name, value in base.items()}
        proposed["query.bias"] += 30
        weights, report = bounded_update(base, proposed, [row], 1)
        self.assertLess(report["scale"], 1)
        self.assertLessEqual(report["meanKL"], SPEC.maxUpdateKL)
        self.assertLessEqual(report["maxKL"], SPEC.maxStateKL)
        self.assertGreater(report["rawMeanKL"], report["meanKL"])
        self.assertEqual(checksum(base), identity)
        for hidden in (False, True):
            prior = log_probabilities(base, row, hidden)
            after = log_probabilities(weights, row, hidden)
            self.assertLessEqual(float(np.exp(prior) @ (prior - after)), SPEC.maxStateKL)
