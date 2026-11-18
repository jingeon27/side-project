import base64
import unittest
import zlib

import numpy as np
from pydantic import ValidationError

from clash_bot.arena.policy.dense import DenseActions
from clash_bot.arena.policy.features import ACTION_SIZE


class DenseActionTensorTest(unittest.TestCase):
    def test_compact_roundtrip_retains_all_positions_and_both_bias_views(self):
        vectors = np.arange(3 * ACTION_SIZE, dtype=np.float32).reshape(3, ACTION_SIZE) / 100
        source = DenseActions.pack(vectors, [-1, 4, 4], [0.1, -6, 2], [0, -7, 1], [0, 2])
        matrix = source.decode()
        np.testing.assert_array_equal(matrix[:, :ACTION_SIZE], vectors)
        np.testing.assert_array_equal(
            matrix[:, -3:], np.array([[-1, 0.1, 0], [4, -6, -7], [4, 2, 1]], np.float32)
        )

    def test_malformed_overlong_and_mismatched_tensors_are_rejected(self):
        source = DenseActions.pack(np.zeros((2, ACTION_SIZE)), [-1, 4], [0, 0], [0, 0], [0, 1])
        for changes in (
            {"count": 1},
            {"count": 4097},
            {"retained": [1, 0]},
            {"retained": [0, 0]},
            {"retained": [2]},
            {"data": "!"},
            {"data": base64.b64encode(zlib.compress(b"x" * 1000000)).decode()},
        ):
            with self.subTest(changes=changes.keys()), self.assertRaises(ValidationError):
                DenseActions.model_validate({**source.model_dump(), **changes})

    def test_nonfinite_features_and_nonintegral_family_are_rejected(self):
        for families, value in (([-1, 0.5], 0), ([-1, 4], float("nan"))):
            with self.assertRaises(ValidationError):
                DenseActions.pack(np.full((2, ACTION_SIZE), value), families, [0, 0], [0, 0], [0])
