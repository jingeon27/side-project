"""Current shared tactical score parameters."""

import json

from clash_bot.paths import CONTRACTS_DIR

SPEC = json.loads((CONTRACTS_DIR / "fast-tactics.json").read_text())
if SPEC["format"] != "clash-fast-tactics-v3":
    raise ValueError("Unknown tactical score contract")
