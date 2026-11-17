import tempfile
import unittest

import mlx.core as mx

from clash_bot.qwen.inputs.feature_cache import FeatureCache
from clash_bot.qwen.learning.learning_policy import FinalMLPLoRA, action_log_probs


class FrozenFeatureCacheTest(unittest.TestCase):
    def test_cache_reuses_frozen_features_but_recalculates_current_adapter_probabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = FeatureCache(directory, 12, 8)
            key = cache.key("model-a", "same exact public input", 3)
            value = {
                "features": mx.arange(12).astype(mx.float32),
                "base": mx.arange(8).astype(mx.float32),
            }
            cache.put(key, value)
            first = cache.get(key)
            self.assertEqual(first["features"].tolist(), value["features"].tolist())
            adapter = FinalMLPLoRA(12, 8)
            rows = mx.random.normal((3, 8))
            sample = {**first, "labels": [0, 1, 2]}
            before = action_log_probs(adapter, sample, mx.ones(8), 1e-6, rows)
            mx.eval(before)
            adapter.b = mx.random.normal((4, 8)) * 0.2
            after = action_log_probs(
                adapter, {**cache.get(key), "labels": [0, 1, 2]}, mx.ones(8), 1e-6, rows
            )
            self.assertFalse(mx.allclose(before, after).item())
            self.assertIsNone(cache.get(cache.key("model-b", "same exact public input", 3)))
            self.assertIsNone(cache.get(cache.key("model-a", "changed context", 3)))
            self.assertNotEqual(key, cache.key("model-a", "same exact public input", 2))
            cache.put(key, {"features": mx.ones(1), "base": mx.ones(8)})
            self.assertIsNone(cache.get(key))


if __name__ == "__main__":
    unittest.main()
