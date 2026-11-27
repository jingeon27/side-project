"""Embed the bundled corpus and fixed choices. Run through reading:embed."""

import base64
import json
import os
from pathlib import Path
import sys

import torch
from huggingface_hub import snapshot_download
from transformers import AutoModel, AutoTokenizer


def embed(model, tokenizer, texts):
    inputs = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
    with torch.inference_mode():
        hidden = model(**inputs).last_hidden_state
        mask = inputs["attention_mask"].unsqueeze(-1)
        means = (hidden * mask).sum(dim=1) / mask.sum(dim=1)
        # Per-vector scaling preserves direction for cosine comparison.
        quantized = torch.round(means * 127 / means.abs().amax(dim=1, keepdim=True)).to(torch.int8)
    return [base64.b64encode(vector.numpy().tobytes()).decode("ascii") for vector in quantized]


def main():
    request = json.load(sys.stdin)
    embedding = request["model"]
    passages = request["inputs"]
    torch.set_num_threads(min(os.cpu_count() or 2, 4))
    cache = Path(__file__).resolve().parents[1] / ".data/embedding-models"
    path = snapshot_download(
        embedding["id"],
        revision=embedding["revision"],
        cache_dir=cache,
        allow_patterns=["config.json", "model.safetensors", "tokenizer.json",
                        "tokenizer_config.json", "special_tokens_map.json"],
    )
    tokenizer = AutoTokenizer.from_pretrained(path, local_files_only=True)
    model = AutoModel.from_pretrained(path, local_files_only=True).eval()
    vectors = {}
    for start in range(0, len(passages), 16):
        batch = passages[start:start + 16]
        encoded = embed(model, tokenizer, [entry["text"] for entry in batch])
        vectors.update((entry["key"], vector) for entry, vector in zip(batch, encoded))
    json.dump(vectors, sys.stdout)


if __name__ == "__main__":
    main()
