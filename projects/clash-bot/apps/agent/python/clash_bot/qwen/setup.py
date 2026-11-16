"""Install the optional Qwen runtime without effects when importing this module."""

import subprocess
import sys
import venv

from clash_bot.paths import DATA_DIR, REQUIREMENTS_DIR

from .model_specs import DEFAULT_MODEL, MODELS


def main():
    if sys.version_info < (3, 11):
        raise SystemExit("Python 3.11 이상이 필요합니다.")
    choice = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MODEL
    if choice not in MODELS:
        raise SystemExit("모델은 2b, 4b 또는 3.8-27b입니다.")
    root = DATA_DIR / "qwen"
    root.mkdir(parents=True, exist_ok=True)
    environment = root / ".venv"
    python = environment / "bin/python"
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_DIR / "qwen.lock")], check=True
    )
    subprocess.run(
        [
            str(python),
            "-m",
            "clash_bot.qwen.download",
            choice,
            str(root / MODELS[choice]["directory"]),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
