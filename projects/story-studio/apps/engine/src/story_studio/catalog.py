"""Pinned model identities packaged with the engine."""
from importlib.resources import files
import json

# Prepared weights the engine loads. Setup removes their downloaded sources once each is ready.
# A new video directory also keeps an older Wan2.1 install from being loaded.
IMAGE_MODEL_DIRECTORY = "image-flux2-klein-4b-q8"
VIDEO_MODEL_DIRECTORY = "video-wan2.2-ti2v-5b"
PREPARED_DIRECTORIES = {"image": IMAGE_MODEL_DIRECTORY, "video-source": VIDEO_MODEL_DIRECTORY}


def model_specs():
    return json.loads(files("story_studio").joinpath("models.json").read_text(encoding="utf-8"))
