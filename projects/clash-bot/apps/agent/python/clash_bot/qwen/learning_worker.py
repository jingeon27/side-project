"""JSON-line transport for the resident model; no game inputs live here."""

import contextlib
import json
import sys
import time
import traceback

from .protocol import parse_learning_request
from .training_budget import close_training_budget, training_budget


def emit(value):
    print(json.dumps(value), flush=True)


def handle_request(worker, request):
    operation = request["op"]
    if worker.evaluation_backup and operation in (
        "train",
        "train_batch",
        "imitate",
        "study",
        "begin_candidate",
        "promote",
    ):
        raise ValueError("Frozen evaluation cannot train")
    if operation in ("train", "train_batch", "imitate") and not worker.candidate_active():
        raise ValueError("The deployed champion is frozen; train a private candidate")
    match operation:
        case "choose" | "train" | "train_batch" | "imitate" | "study" | "rehearse" | "promote":
            return getattr(worker, operation)(request)
        case "status" | "warmup" | "end_candidate":
            return getattr(worker, operation)()
        case "checkout":
            return worker.checkout(request.get("checkpoint"))
        case "begin_candidate":
            return worker.begin_candidate(request["directory"])
        case "configure_candidate":
            return worker.configure_candidate(request["controller_version"])
        case _:
            raise ValueError("Unsupported learning operation")


def serve(worker, requests, emit_result=emit, peak_memory=lambda: 0.0):
    for line in requests:
        started = time.monotonic()
        try:
            request = parse_learning_request(line)
            with contextlib.redirect_stdout(sys.stderr):
                result = handle_request(worker, request)
            emit_result(
                {
                    "type": "result",
                    **result,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                    "peak_gb": peak_memory(),
                }
            )
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit_result({"type": "error", "message": str(error)})


def main():
    with contextlib.redirect_stdout(sys.stderr):
        import mlx.core as mx

        from .learning_policy import weights_digest
        from .runtime import LearningWorker

        training_budget()  # Validate an explicit target before loading the model.
        worker = LearningWorker(sys.argv[1], sys.argv[2])
    emit(
        {
            "type": "ready",
            "version": worker.learner.metadata["version"],
            "weights_sha256": weights_digest(worker.learner.adapter),
        }
    )
    try:
        serve(worker, sys.stdin, peak_memory=lambda: mx.get_peak_memory() / 1024**3)
    finally:
        close_training_budget()


if __name__ == "__main__":
    main()
