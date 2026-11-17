"""The reply channel a worker process shares with its Node client: one JSON value per line."""

import json
import os


def protocol_channel():
    # Replies get their own descriptor; fd 1 then points at stderr, so Python or native
    # library output can never appear between replies and shift them.
    channel = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)

    def emit(value):
        channel.write(json.dumps(value) + "\n")
        channel.flush()

    return emit
