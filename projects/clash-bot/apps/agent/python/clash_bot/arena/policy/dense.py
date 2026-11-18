"""Compact, bounded full-action tensors; decode only the current gradient batch."""

import base64
import binascii
import zlib
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .features import ACTION_SIZE

WIDTH = ACTION_SIZE + 3  # features, card family, normal bias, no-tower bias


class DenseActions(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    encoding: Literal["float32_zlib_base64_v1"]
    count: int = Field(ge=1, le=4096)
    retained: list[int] = Field(min_length=1)
    data: str = Field(max_length=4096 * WIDTH * 6)

    def decode(self):
        limit = self.count * WIDTH * 4
        try:
            inflater = zlib.decompressobj()
            raw = inflater.decompress(base64.b64decode(self.data, validate=True), limit + 1)
        except (ValueError, binascii.Error, zlib.error) as error:
            raise ValueError("Invalid dense action encoding") from error
        if (
            len(raw) != limit
            or not inflater.eof
            or inflater.unused_data
            or inflater.unconsumed_tail
        ):
            raise ValueError("Dense action tensor size differs from its declared shape")
        return np.frombuffer(raw, dtype="<f4").reshape(self.count, WIDTH)

    @model_validator(mode="after")
    def tensor(self):
        if (
            self.retained != sorted(set(self.retained))
            or self.retained[0] < 0
            or self.retained[-1] >= self.count
        ):
            raise ValueError("Retained dense actions must be unique, ordered and in bounds")
        matrix = self.decode()
        families = matrix[:, ACTION_SIZE]
        if not np.isfinite(matrix).all() or not np.equal(families, np.floor(families)).all():
            raise ValueError("Dense action features/biases must be finite and families integral")
        return self

    @classmethod
    def pack(cls, vectors, families, biases, masked_biases, retained):
        matrix = np.column_stack((vectors, families, biases, masked_biases)).astype("<f4")
        return cls(
            encoding="float32_zlib_base64_v1",
            count=len(matrix),
            retained=retained,
            data=base64.b64encode(zlib.compress(matrix.tobytes(), level=1)).decode("ascii"),
        )
