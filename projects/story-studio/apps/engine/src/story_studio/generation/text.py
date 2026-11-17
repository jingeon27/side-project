"""Structured Korean writing with the local Gemma model, grounded on retrieved materials."""
import json

from ..catalog import model_specs
from ..materials.embedding import load_embedder
from ..materials.retrieval import retrieve


def excerpts(passages):
    return [{"source": passage["title"], "text": passage["text"]} for passage in passages]


def with_materials(payload, found):
    """Retrieved passages join the writer's input as story material, never as instructions."""
    added = {name: excerpts(found[key]) for name, key in (("materials", "materials"), ("style_samples", "style")) if found[key]}
    return {**payload, **added} if added else payload


def source_titles(found):
    return list(dict.fromkeys(passage["title"] for passage in found["materials"] + found["style"]))


def load_writer(root, progress):
    import mlx.core as mx
    from mlx_vlm import load
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(24 * 1024**3)
    progress("Gemma 4 로컬 모델을 불러오는 중")
    return load(str(root / "local/models" / model_specs()["text"]["directory"]), trust_remote_code=False)


def write(writer, request, found):
    from mlx_vlm import generate
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.structured import build_json_schema_logits_processor
    model, processor = writer
    messages = [{"role": "system", "content": request["system"]},
                {"role": "user", "content": json.dumps(with_materials(request["input"], found), ensure_ascii=False)}]
    prompt = apply_chat_template(processor, model.config, messages, enable_thinking=False)
    # Gemma's own defaults sample at temperature 1.0; a 4-bit model then misspells Korean more often.
    # Each request writes one scene, so the lower temperature has no long output to loop in.
    result = generate(model, processor, prompt, max_tokens=request.get("maxTokens", 3000),
                      temperature=0.8, top_p=0.95, top_k=64, verbose=False, enable_thinking=False,
                      logits_processors=[build_json_schema_logits_processor(processor.tokenizer, request["schema"])])
    return {"output": json.loads(result.text), "sources": source_titles(found)}


def generate_text(root, request, progress):
    # Retrieval releases the embedding model before the writer loads, so the two never share memory.
    found = retrieve(root, request.get("retrieval"), progress)
    writer = load_writer(root, progress)
    progress("한국어 원고를 작성하는 중")
    return write(writer, request, found)


def shared_embedder(root):
    """An embedder loaded on first use and then kept for the rest of a session."""
    loaded = []

    def embed(texts):
        if not loaded:
            loaded.append(load_embedder(root))
        return loaded[0](texts)

    return embed


def text_session(root, progress, emit, lines):
    """Answer one writing request per input line with the model loaded once; ends when the input closes.

    A story is a plan and then one request per scene. Loading 17 GiB for each of them costs more than writing.
    """
    writer = load_writer(root, progress)
    embed = shared_embedder(root)
    turns = 0
    for line in lines:
        if not line.strip():
            continue
        request = json.loads(line)
        emit({"reply": write(writer, request, retrieve(root, request.get("retrieval"), progress, embed))})
        turns += 1
    return {"turns": turns}
