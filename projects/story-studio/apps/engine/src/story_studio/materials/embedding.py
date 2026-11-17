"""Text embeddings with EmbeddingGemma 2 on MLX, loaded only while indexing or retrieving."""
from ..catalog import model_specs

DIMENSIONS = 768
BATCH = 16
MAX_TOKENS = 2048


def query_text(query):
    return f"task: search result | query: {query}"


def document_text(title, text):
    return f"title: {title or 'none'} | text: {text}"


def load_embedder(root):
    """Return `embed(texts) -> vectors`. Dropping it and clearing the MLX cache releases the model."""
    import mlx.core as mx
    from mlx_vlm.embedding_loader import load_embedding_model
    from transformers import AutoTokenizer
    path = root / "local/models" / model_specs()["embedding"]["directory"]
    # Only the text encoder runs here; lazy loading leaves the image and audio towers on disk.
    model = load_embedding_model(path, lazy=True)
    tokenizer = AutoTokenizer.from_pretrained(str(path))

    def embed(texts):
        vectors = []
        for start in range(0, len(texts), BATCH):
            inputs = tokenizer(texts[start:start + BATCH], padding=True, truncation=True,
                               max_length=MAX_TOKENS, return_tensors="np")
            output = model(input_ids=mx.array(inputs["input_ids"]), attention_mask=mx.array(inputs["attention_mask"]))
            # The model computes in bfloat16, which neither NumPy nor Arrow stores.
            vectors.extend(output.text_embeds.astype(mx.float32).tolist())
        return vectors

    return embed


def release():
    import gc
    import mlx.core as mx
    gc.collect()
    mx.clear_cache()
