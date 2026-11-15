"""Pinned model identities packaged with the engine."""
from importlib.resources import files
import json


def model_specs():
    return json.loads(files("story_studio").joinpath("models.json").read_text(encoding="utf-8"))
