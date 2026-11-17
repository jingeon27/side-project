import unittest
from types import SimpleNamespace

import mlx.core as mx
from mlx_vlm.models.cache import ArraysCache

from clash_bot.qwen.inputs.text_prefix import FrozenTextPrefix, common_prefix_length


class CausalLanguage:
    def __init__(self):
        self.calls = []

    def make_cache(self):
        cache = ArraysCache(size=1)
        cache[0] = mx.array([0.0])
        return [cache]

    def __call__(self, tokens, *, inputs_embeds, position_ids, cache, **_kwargs):
        self.calls.append(tokens.tolist())
        value = cache[0][0] + mx.sum(tokens) + mx.sum(position_ids)
        cache[0][0] = value
        return value


def embeddings(tokens):
    return SimpleNamespace(
        inputs_embeds=tokens[..., None].astype(mx.float32),
        position_ids=mx.arange(tokens.shape[1])[None, :],
        rope_deltas=mx.zeros((1, 1)),
    )


class FrozenTextPrefixTest(unittest.TestCase):
    def test_hit_matches_miss_without_mutating_the_retained_recurrent_state(self):
        language = CausalLanguage()
        prefix = FrozenTextPrefix()
        tokens = mx.array([[1, 2, 3, 4]])
        first, hit = prefix.forward(language, tokens, embeddings(tokens), 2)
        self.assertFalse(hit)
        for _ in range(3):
            again, hit = prefix.forward(language, tokens, embeddings(tokens), 2)
            self.assertTrue(hit)
            self.assertEqual(first.item(), again.item())
        self.assertEqual(language.calls, [[[1, 2]], [[3, 4]], [[3, 4]], [[3, 4]], [[3, 4]]])

    def test_changed_field_suffix_is_always_recomputed(self):
        language = CausalLanguage()
        prefix = FrozenTextPrefix()
        tokens = mx.array([[1, 2, 3, 4]])
        first, _ = prefix.forward(language, tokens, embeddings(tokens), 2)
        changed = mx.array([[1, 2, 3, 9]])
        second, hit = prefix.forward(language, changed, embeddings(changed), 2)
        self.assertTrue(hit)
        self.assertEqual(second.item() - first.item(), 5)

    def test_changed_prefix_replaces_the_single_entry_and_respects_memory_limit(self):
        language = CausalLanguage()
        prefix = FrozenTextPrefix()
        for values in [[1, 2, 3], [1, 9, 3], [1, 2, 3]]:
            tokens = mx.array([values])
            _, hit = prefix.forward(language, tokens, embeddings(tokens), 2)
            self.assertFalse(hit)
            self.assertLessEqual(prefix.nbytes, prefix.maximum_bytes)
        bounded = FrozenTextPrefix(maximum_bytes=0)
        for _ in range(2):
            _, hit = bounded.forward(language, tokens, embeddings(tokens), 2)
            self.assertFalse(hit)
            self.assertEqual(bounded.nbytes, 0)

    def test_token_boundary_matching_leaves_the_current_final_token(self):
        self.assertEqual(common_prefix_length([1, 2, 3], [1, 2, 9]), 2)
        self.assertEqual(common_prefix_length([1, 2, 3], [1, 2, 3]), 2)
        self.assertEqual(common_prefix_length([1, 2, 3], [9, 2]), 0)
        self.assertEqual(common_prefix_length([], [1]), 0)

    def test_rejects_empty_current_state_or_multiple_rows(self):
        prefix = FrozenTextPrefix()
        for tokens, length in [(mx.array([[1, 2]]), 2), (mx.array([[1], [2]]), 1)]:
            with self.assertRaisesRegex(ValueError, "one row"):
                prefix.forward(CausalLanguage(), tokens, embeddings(tokens), length)
