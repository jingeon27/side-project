"""Install the optional local Qwen runtime inside this project only."""

import pathlib
import json
import subprocess
import sys
import venv

from model_specs import MODELS, DEFAULT_MODEL

ROOT = pathlib.Path(__file__).resolve().parents[4] / ".data" / "qwen"

if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11 이상이 필요합니다.")
choice = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL
if choice not in MODELS:
    raise SystemExit("모델은 2b, 4b 또는 3.8-27b입니다.")
ROOT.mkdir(parents=True, exist_ok=True)
environment = ROOT / ".venv"
if not (environment / "bin/python").exists():
    venv.EnvBuilder(with_pip=True).create(environment)
python = str(environment / "bin/python")
subprocess.run([python, "-m", "pip", "install", "-r", str(pathlib.Path(__file__).with_name("requirements.lock"))], check=True)
spec = MODELS[choice]
subprocess.run([python, "-c", """
import hashlib, os, pathlib, sys, json
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from huggingface_hub import snapshot_download
repo, revision, files, folder = sys.argv[1:]
path = pathlib.Path(snapshot_download(repo, revision=revision, local_dir=folder,
    allow_patterns=['*.json','*.jinja','*.safetensors']))
for name,digest in json.loads(files).items():
    with (path/name).open('rb') as handle:
        actual = hashlib.file_digest(handle, 'sha256').hexdigest()
    if actual != digest:
        raise SystemExit('모델 체크섬이 일치하지 않습니다: '+name)
print('모델 다운로드와 SHA-256 검증 완료:', path)
""", spec['repo'], spec['revision'], json.dumps(spec['files']), str(ROOT / spec['directory'])], check=True)
