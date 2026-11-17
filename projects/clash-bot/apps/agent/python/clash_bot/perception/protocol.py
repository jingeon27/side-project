"""JSON-lines wire contract of the CPU perception worker, kept free of model imports."""

import json
import sys
import time
import traceback
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class Request(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)
    image: str = Field(min_length=1)


class ScanRequest(Request):
    op: Literal["scan"] = "scan"


class GuardRequest(Request):
    op: Literal["guard"]


class AbsentRequest(Request):
    op: Literal["absent"]
    card: str = Field(min_length=1)
    box: list[float] = Field(min_length=4, max_length=4)
    gap_ms: float = Field(ge=0)


PERCEPTION_REQUEST = TypeAdapter(
    Annotated[ScanRequest | GuardRequest | AbsentRequest, Field(discriminator="op")]
)


def parse_perception_request(line):
    payload = json.loads(line)
    # A scan request carries no op. Any other operation must be named and known.
    if isinstance(payload, dict):
        payload.setdefault("op", "scan")
    return PERCEPTION_REQUEST.validate_python(payload)


def serve(handlers, requests, emit):
    for line in requests:
        started = time.monotonic()
        try:
            request = parse_perception_request(line)
            result = handlers[request.op](request.model_dump())
            emit(
                {
                    "type": "result",
                    **result,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                }
            )
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "message": str(error)})
