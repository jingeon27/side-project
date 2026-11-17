"""One bounded, immutable causal cache for the frozen text rule prefix.

The adapter is after the final attention/recurrent state, so changing its
weights does not invalidate this prefix. Field state and actions are never
cached here. Both a miss and a hit use the same prefix/suffix execution path.
"""

import copy

import mlx.core as mx


def common_prefix_length(full, prefix):
    # Always leave a final token to produce the current decision's features.
    limit = min(len(prefix), max(0, len(full) - 1))
    return next((i for i in range(limit) if full[i] != prefix[i]), limit)


class FrozenTextPrefix:
    def __init__(self, maximum_bytes=256 * 1024 * 1024):
        self.maximum_bytes = maximum_bytes
        self.tokens = None
        self.cache = None

    @property
    def nbytes(self):
        return sum(layer.nbytes for layer in self.cache) if self.cache is not None else 0

    def forward(self, language, token_ids, embeddings, length):
        if token_ids.shape[0] != 1 or not 0 < length < token_ids.shape[1]:
            raise ValueError("A text prefix needs one row and a nonempty current suffix")
        tokens = tuple(token_ids[0, :length].tolist())
        hit = self.cache is not None and tokens == self.tokens

        def piece(start, end, cache):
            return language(
                token_ids[:, start:end],
                inputs_embeds=embeddings.inputs_embeds[:, start:end, :],
                position_ids=embeddings.position_ids[..., start:end],
                rope_deltas=embeddings.rope_deltas,
                cache=cache,
                skip_logits=True,
                return_hidden=True,
            )

        if hit:
            cache = copy.deepcopy(self.cache)
        else:
            cache = language.make_cache()
            piece(0, length, cache)
            mx.eval([layer.state for layer in cache])
            # Replacing the single entry bounds retained memory independently
            # of the number of matches, candidates or model adapter versions.
            self.tokens, self.cache = None, None
            if sum(layer.nbytes for layer in cache) <= self.maximum_bytes:
                self.tokens, self.cache = tokens, copy.deepcopy(cache)
        return piece(length, token_ids.shape[1], cache), hit
