"""Qualification rules shared with the TypeScript evaluation gate through one contract file."""

import json
import re

from clash_bot.paths import CONTRACTS_DIR

QUALIFICATION = json.loads((CONTRACTS_DIR / "qualification.json").read_text())
METHOD = QUALIFICATION["method"]
MINIMUM_PAIRS = QUALIFICATION["minimumPairs"]
MINIMUM_MEAN_SCORE = QUALIFICATION["minimumMeanScore"]
FAMILY_ALPHA = QUALIFICATION["familyAlpha"]
RESULT_LABEL = re.compile(QUALIFICATION["resultLabelPattern"])


def attempt_alpha(attempt):
    # Attempt k spends FAMILY_ALPHA / ((k + 1)(k + 2)); all attempts together never exceed it.
    return FAMILY_ALPHA / ((attempt + 1) * (attempt + 2))
