"""One resident local MLX model. JSON lines over stdio; no game inputs here."""

import contextlib
import json
import sys
import time
import traceback

from clash_bot.qwen.model_specs import MODEL, require_model_directory

from .protocol import parse_inference_request


def emit(value):
    print(json.dumps(value), flush=True)


def main():
    with contextlib.redirect_stdout(sys.stderr):
        import mlx.core as mx
        from mlx_vlm import generate, load
        from mlx_vlm.prompt_utils import apply_chat_template
        from mlx_vlm.structured import build_json_schema_logits_processor

        mx.set_cache_limit(256 * 1024 * 1024)
        require_model_directory(sys.argv[1])
        mx.set_memory_limit(MODEL["memory_gib"] * 1024**3)
        model, processor = load(sys.argv[1], trust_remote_code=False)
    emit({"type": "ready"})
    for line in sys.stdin:
        started = time.monotonic()
        try:
            request = parse_inference_request(line)
            images = request["images"]
            with contextlib.redirect_stdout(sys.stderr):
                prompt = apply_chat_template(
                    processor,
                    model.config,
                    request["prompt"],
                    num_images=len(images),
                    enable_thinking=False,
                )
                output = generate(
                    model,
                    processor,
                    prompt,
                    image=images,
                    max_tokens=request.get("max_tokens", 128),
                    temperature=0.1,
                    verbose=False,
                    enable_thinking=False,
                    logits_processors=[
                        build_json_schema_logits_processor(processor.tokenizer, request["schema"])
                    ]
                    if request.get("schema")
                    else None,
                )
            emit(
                {
                    "type": "result",
                    "text": output.text,
                    "elapsed_ms": round((time.monotonic() - started) * 1000),
                    "peak_gb": mx.get_peak_memory() / 1024**3,
                }
            )
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
