"""Generated assets and explicitly supplied public example files."""
from pathlib import Path
import re
import uuid


def asset_path(root, extension):
    folder = root / "assets"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{uuid.uuid4()}.{extension}"


def asset_url(path):
    return "/api/assets/" + path.name


def owned_asset(root, url, extension, examples_dir):
    if not re.fullmatch(r"/api/assets/[a-f0-9-]{36}\." + extension, url):
        raise ValueError("지원하지 않는 로컬 파일 경로입니다")
    path = root / "assets" / url.split("/")[-1]
    if not path.is_file():
        path = examples_dir / url.split("/")[-1]
        if not path.is_file():
            raise ValueError("원본 파일을 찾을 수 없습니다")
    return path
