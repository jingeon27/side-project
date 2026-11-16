"""Application-owned paths, independent of cwd and Python module depth."""

import os
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = AGENT_DIR.parents[1]
DATA_DIR = Path(os.environ.get("CLASH_BOT_DATA_DIR", PROJECT_DIR / ".data")).resolve()
ASSETS_DIR = AGENT_DIR / "assets"
CONTRACTS_DIR = AGENT_DIR / "contracts"
FIXTURES_DIR = AGENT_DIR / "test-fixtures"
REQUIREMENTS_DIR = AGENT_DIR / "python/requirements"
# Same rule as Node's pythonExecutable. Never resolve it: a venv's python is a link to its base.
DEFAULT_QWEN_PYTHON = DATA_DIR / "qwen/.venv/bin/python"
QWEN_PYTHON = Path(os.environ.get("CLASH_BOT_PYTHON") or DEFAULT_QWEN_PYTHON)
