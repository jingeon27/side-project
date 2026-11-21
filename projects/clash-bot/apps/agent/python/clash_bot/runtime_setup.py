"""Create the project Python environment that self-play, perception and Trophy learning share."""

import subprocess
import sys
import venv

from clash_bot.paths import DEFAULT_RUNTIME_PYTHON, REQUIREMENTS_DIR, RUNTIME_PYTHON
from clash_bot.runtime_guard import refuse_while_running


def main():
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11 이상이 필요합니다.")
    refuse_while_running("Python 실행 환경을 준비")
    python = RUNTIME_PYTHON
    if not python.exists():
        if python != DEFAULT_RUNTIME_PYTHON:
            raise SystemExit("CLASH_BOT_PYTHON이 가리키는 Python이 없습니다.")
        venv.EnvBuilder(with_pip=True).create(DEFAULT_RUNTIME_PYTHON.parents[1])
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_DIR / "runtime.lock")],
        check=True,
    )


if __name__ == "__main__":
    main()
