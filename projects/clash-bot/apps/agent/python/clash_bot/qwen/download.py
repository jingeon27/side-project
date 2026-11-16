"""Download a pinned model and reuse the runtime's source-file verification."""

import os
import sys
from pathlib import Path

from .model_specs import MODELS, verify_model


def main():
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from huggingface_hub import snapshot_download

    spec = MODELS[sys.argv[1]]
    path = Path(
        snapshot_download(
            spec["repo"],
            revision=spec["revision"],
            local_dir=sys.argv[2],
            allow_patterns=["*.json", "*.jinja", "*.safetensors"],
        )
    )
    verify_model(path, spec)
    print("모델 다운로드와 SHA-256 검증 완료:", path)


if __name__ == "__main__":
    main()
