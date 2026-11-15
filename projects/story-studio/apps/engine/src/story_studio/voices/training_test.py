"""Native MLX verification for adapter updates and checkpoint recovery."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

try:
    import mlx.core as mx
    import mlx.nn as nn
    from mlx.utils import tree_flatten
except ModuleNotFoundError as error:
    if error.name and error.name.startswith('mlx'):
        raise unittest.SkipTest('Native training verification requires Apple Silicon and the MLX extra') from error
    raise

from . import training


class TinyTalker(nn.Module):
    def __init__(self):
        super().__init__()
        base = nn.Linear(8, 8)
        base.freeze()
        self.projection = training.VoiceLoRA(base)
        self.embedding = nn.Embedding(3201, 8)
        self.embedding.freeze()

    def get_input_embeddings(self):
        return self.embedding


class TinyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.talker = TinyTalker()
        self.config = SimpleNamespace(talker_config=SimpleNamespace())


def tiny_loss(talker, sample):
    return nn.losses.mse_loss(talker.projection(sample['inputs']), sample['targets'])


class VoiceTrainingTests(unittest.TestCase):
    def test_inference_strength_is_idempotent_and_preserves_the_frozen_base(self):
        mx.random.seed(19)
        adapter = training.VoiceLoRA(nn.Linear(8, 8))
        adapter.lora_b = mx.full(adapter.lora_b.shape, .2)
        inputs = mx.ones((2, 8))
        base = adapter.base(inputs)
        original = mx.array(adapter.base.weight)
        full_delta = adapter(inputs) - base
        adapter.set_inference_strength(.5)
        adapter.set_inference_strength(.5)
        self.assertTrue(bool(mx.allclose(adapter(inputs) - base, full_delta * .5, atol=1e-6).item()))
        self.assertTrue(bool(mx.array_equal(adapter.base.weight, original).item()))
        with self.assertRaises(ValueError):
            adapter.set_inference_strength(0)

    def test_zero_adapter_preserves_base_and_resumed_optimizer_matches_uninterrupted_training(self):
        mx.random.seed(17)
        model = TinyModel()
        mx.random.seed(17)
        resumed = TinyModel()
        samples = [{'inputs': mx.ones((2, 8)), 'targets': mx.zeros((2, 8))}, {'inputs': mx.full((2, 8), 0.2), 'targets': mx.ones((2, 8))}]
        original = mx.array(model.talker.projection.base.weight)
        self.assertTrue(bool(mx.allclose(model.talker.projection(samples[0]['inputs']), model.talker.projection.base(samples[0]['inputs'])).item()))
        embedding = mx.ones((1, 8))
        with tempfile.TemporaryDirectory() as folder, patch.object(training, 'voice_loss', tiny_loss):
            full = training.train_steps(model, samples, embedding, Path(folder) / 'full', 2, lambda *_: None)
            first = training.train_steps(resumed, samples, embedding, Path(folder) / 'resumed', 1, lambda *_: None)
            mx.random.seed(999)
            fresh = TinyModel()
            # The real loader reloads the same frozen base before loading the adapter.
            fresh.talker.projection.base.load_weights(list(tree_flatten(resumed.talker.projection.base.parameters())))
            final = training.train_steps(fresh, samples, embedding, Path(folder) / 'resumed', 2, lambda *_: None, resume=first)
            actual = mx.load(str(final / 'adapters.safetensors'))
            expected = mx.load(str(full / 'adapters.safetensors'))
            for key in expected:
                self.assertTrue(bool(mx.allclose(actual[key], expected[key], atol=1e-7).item()), key)
            self.assertGreater(float(mx.sum(mx.abs(fresh.talker.projection.lora_b)).item()), 0)
            self.assertTrue(bool(mx.array_equal(original, model.talker.projection.base.weight).item()))
            self.assertEqual((Path(folder) / 'resumed/latest').read_text(), final.name)
            self.assertLessEqual(len(list((Path(folder) / 'resumed').glob('step-*'))), 2)


if __name__ == '__main__':
    unittest.main()
