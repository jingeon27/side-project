"""Download a pinned model and reuse the runtime's source-file verification."""

import os
import sys
from pathlib import Path

from .model_specs import MODEL, verify_model


def main():
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    from huggingface_hub import snapshot_download

    path = Path(
        snapshot_download(
            MODEL["repo"],
            revision=MODEL["revision"],
            local_dir=sys.argv[1],
            allow_patterns=["*.json", "*.jinja", "*.safetensors"],
        )
    )
    verify_model(path, MODEL)
    print("모델 다운로드와 SHA-256 검증 완료:", path)


if __name__ == "__main__":
    main()
