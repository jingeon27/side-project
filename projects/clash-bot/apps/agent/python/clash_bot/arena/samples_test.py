"""Self-play rows are checked before any gradient, without the native battle engine."""

import unittest

from pydantic import ValidationError

from clash_bot.arena.fast_features import ACTION_SIZE, STATE_SIZE
from clash_bot.arena.samples import PolicyMetadata, TrainingSample

ROW = {
    "features": [0.0] * STATE_SIZE,
    "actions": [[-1, 0, 0], [5, 3000, 9000]],
    "actionFeatures": [[0.0] * ACTION_SIZE, [0.0] * ACTION_SIZE],
    "target": [0.25, 0.75],
    "outcome": -1,
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
            {"features": [0.0] * (STATE_SIZE - 1)},
            {"actionFeatures": [[0.0] * ACTION_SIZE, [0.0] * (ACTION_SIZE + 1)]},
            {"target": [float("nan"), 1.0]},
        ]:
            with self.subTest(change=sorted(change)), self.assertRaises(ValidationError):
                TrainingSample.model_validate({**ROW, **change})


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
