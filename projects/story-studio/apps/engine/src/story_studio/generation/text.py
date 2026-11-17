"""Structured Korean writing with the local Gemma model."""
import json

from ..catalog import model_specs


def generate_text(root, request, progress):
    import mlx.core as mx
    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.structured import build_json_schema_logits_processor
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(24 * 1024**3)
    progress("Gemma 4 로컬 모델을 불러오는 중")
    model, processor = load(str(root / "local/models" / model_specs()["text"]["directory"]), trust_remote_code=False)
    messages = [{"role": "system", "content": request["system"]},
                {"role": "user", "content": json.dumps(request["input"], ensure_ascii=False)}]
    prompt = apply_chat_template(processor, model.config, messages, enable_thinking=False)
    progress("한국어 원고를 작성하는 중")
    # Gemma's own defaults sample at temperature 1.0; a 4-bit model then misspells Korean more often.
    result = generate(model, processor, prompt, max_tokens=request.get("maxTokens", 5000),
                      temperature=0.8, top_p=0.95, top_k=64, verbose=False, enable_thinking=False,
                      logits_processors=[build_json_schema_logits_processor(processor.tokenizer, request["schema"])])
    return json.loads(result.text)
