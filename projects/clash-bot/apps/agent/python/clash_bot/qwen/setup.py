"""Install the optional Qwen runtime without effects when importing this module."""

import subprocess
import sys
import venv

from clash_bot.paths import DATA_DIR, DEFAULT_QWEN_PYTHON, QWEN_PYTHON, REQUIREMENTS_DIR
from clash_bot.runtime_guard import refuse_while_running

from .model_specs import MODEL


def main():
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11 이상이 필요합니다.")
    refuse_while_running("Qwen 환경과 모델을 준비")
    root = DATA_DIR / "qwen"
    root.mkdir(parents=True, exist_ok=True)
    python = QWEN_PYTHON
    if not python.exists():
        if python != DEFAULT_QWEN_PYTHON:
            raise SystemExit("CLASH_BOT_PYTHON이 가리키는 Python이 없습니다.")
        venv.EnvBuilder(with_pip=True).create(root / ".venv")
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_DIR / "qwen.lock")], check=True
    )
    subprocess.run(
        [
            str(python),
            "-m",
            "clash_bot.qwen.download",
            str(root / MODEL["directory"]),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
