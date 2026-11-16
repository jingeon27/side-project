"""Install development tools without changing the active model environment."""

import subprocess
import venv

from clash_bot.paths import PROJECT_DIR, REQUIREMENTS_DIR


def main():
    environment = PROJECT_DIR / ".data/python-tools"
    python = environment / "bin/python"
    if not python.exists():
        venv.EnvBuilder(with_pip=True).create(environment)
    subprocess.run(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "-r",
            str(REQUIREMENTS_DIR / "core.lock"),
            "-r",
            str(REQUIREMENTS_DIR / "development.lock"),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
