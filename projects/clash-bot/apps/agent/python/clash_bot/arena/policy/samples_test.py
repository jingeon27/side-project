"""Self-play rows are checked before any gradient, without the native battle engine."""

import unittest

import numpy as np
from pydantic import ValidationError

from clash_bot.arena.policy.dense import DenseActions
from clash_bot.arena.policy.features import ACTION_SIZE, STATE_SIZE
from clash_bot.arena.policy.samples import (
    PolicyMetadata,
    SparseFeatures,
    TrainingSample,
    value_target,
)

ROW = {
    "features": {"index": [1, 7, STATE_SIZE - 1], "value": [0.4, 1.0, 0.5]},
    "actions": [[-1, 0, 0], [5, 3000, 9000]],
    "actionFeatures": [[0.0] * ACTION_SIZE, [0.0] * ACTION_SIZE],
    "actionBias": [0.0, 0.0],
    "actionBiasWithoutTowers": [0.0, 0.0],
    "source": DenseActions.pack(
        np.zeros((2, ACTION_SIZE)), [-1, 5], [0, 0], [0, 0], [0, 1]
    ).model_dump(),
    "target": [0.25, 0.75],
    "targetWithoutTowers": [0.25, 0.75],
    "outcome": -1,
    "value": -0.6,
    "observation": {"ignored": True},
}


class TrainingSampleTest(unittest.TestCase):
    def test_a_completed_searched_position_is_accepted(self):
        sample = TrainingSample.model_validate(ROW)
        self.assertEqual(sample.outcome, -1)
        self.assertEqual(len(sample.target), 2)

    def test_truncated_or_malformed_rows_never_reach_training(self):
        for change in [
            {"outcome": None},
            {"outcome": 2},
            {"target": [0.5, 0.6]},
            {"target": [1.0]},
            {"features": {"index": [STATE_SIZE], "value": [1.0]}},
            {"features": {"index": [7, 1], "value": [1.0, 0.4]}},
            {"features": {"index": [1], "value": [1.0, 0.4]}},
            {"value": -1.5},
            {"actionFeatures": [[0.0] * ACTION_SIZE, [0.0] * (ACTION_SIZE + 1)]},
            {"target": [float("nan"), 1.0]},
            {"actionBias": [0.0]},
            {"actionBias": [0.0, float("nan")]},
            {"targetWithoutTowers": [0.0]},
            {"targetWithoutTowers": [0.0, float("nan")]},
            {"source": {**ROW["source"], "count": 3}},
        ]:
            with self.subTest(change=sorted(change)), self.assertRaises(ValidationError):
                TrainingSample.model_validate({**ROW, **change})

        with self.assertRaises(ValidationError):
            TrainingSample.model_validate(
                {key: value for key, value in ROW.items() if key != "actionBias"}
            )
        with self.assertRaises(ValidationError):
            TrainingSample.model_validate(
                {key: value for key, value in ROW.items() if key != "source"}
            )


class StoredValueTest(unittest.TestCase):
    def test_sparse_features_round_trip_the_dense_state(self):
        sample = TrainingSample.model_validate(ROW)
        dense = sample.features.dense()
        self.assertEqual(dense.shape, (STATE_SIZE,))
        restored = SparseFeatures.of(dense)
        self.assertEqual(restored.index, sample.features.index)
        np.testing.assert_allclose(restored.value, sample.features.value, rtol=1e-6)

    def test_the_tower_margin_separates_close_losses_from_shutouts(self):
        self.assertEqual(value_target(-1, -1), -1)
        self.assertGreater(value_target(-1, -0.2), value_target(-1, -0.9))
        self.assertEqual(value_target(1, 3), 1)
        self.assertEqual(value_target(0, 0), 0)


class PolicyMetadataTest(unittest.TestCase):
    def test_training_reports_stay_while_identity_fields_are_checked(self):
        meta = PolicyMetadata.model_validate(
            {
                "format": "clash-arena-policy-value-v2",
                "version": 3,
                "rulesID": "rules-a",
                "weightsSHA256": "a" * 64,
                "training": {"steps": 9},
            }
        )
        self.assertEqual(meta.model_dump()["training"], {"steps": 9})
        with self.assertRaises(ValidationError):
            PolicyMetadata.model_validate({**meta.model_dump(), "weightsSHA256": "short"})


if __name__ == "__main__":
    unittest.main()
