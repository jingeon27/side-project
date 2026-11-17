"""Pinned model identities packaged with the engine."""
from importlib.resources import files
import json

# Converted MLX video weights. A new directory keeps an older Wan2.1 install from being loaded.
VIDEO_MODEL_DIRECTORY = "video-wan2.2-ti2v-5b"


def model_specs():
    return json.loads(files("story_studio").joinpath("models.json").read_text(encoding="utf-8"))
