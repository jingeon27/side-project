"""Frozen backbone feature capture and the final-MLP adapter hook."""

import mlx.core as mx
import mlx.nn as nn


def output_token_rows(language_model, token_ids):
    projection = language_model.lm_head
    if isinstance(projection, nn.QuantizedLinear):
        return mx.dequantize(
            projection.weight[token_ids],
            projection.scales[token_ids].astype(mx.float32),
            projection.biases[token_ids].astype(mx.float32),
            group_size=projection.group_size,
            bits=projection.bits,
            mode=projection.mode,
        )
    return projection.weight[token_ids]


class Capture(nn.Module):
    def __init__(self, original, sink, key):
        super().__init__()
        self.original = original
        object.__setattr__(self, "_record", lambda value: sink.update({key: value[0, -1]}))

    def __call__(self, value):
        self._record(value)
        return self.original(value)


class AdaptedFinalNorm(nn.Module):
    """Apply the last-MLP low-rank delta inside Qwen, before its native RMSNorm.

    Only the last token is needed for the one-token legal-action policy. Earlier
    tokens have no subsequent attention layer, so their LoRA deltas can be skipped.
    """

    def __init__(self, original, adapter, sink):
        super().__init__()
        self.original = original
        self.adapter = adapter
        object.__setattr__(self, "_sink", sink)

    def __call__(self, value):
        self._sink["base"] = value[0, -1]
        last = (
            value[:, -1:, :].astype(mx.float32)
            + self.adapter(self._sink["features"])[None, None, :]
        )
        normalized = self.original(value).astype(mx.float32)
        return mx.concatenate([normalized[:, :-1, :], self.original(last)], axis=1)
