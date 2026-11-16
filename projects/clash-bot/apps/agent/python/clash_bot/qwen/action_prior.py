"""Explicit mechanics priors for the same categorical policy used by PPO.

All legal choices remain available. Position count must not buy a card more
probability; observed-zero opportunities and a known reserved counter pay a
cost. These are declared priors, not claims that the model learned the rules.
"""

import json
import math
import re
from collections import Counter

from clash_bot.paths import CONTRACTS_DIR

POLICY = json.loads((CONTRACTS_DIR / "combat-projection.json").read_text())["policy"]


def action_prior(prompt, count):
    actions = re.findall(r"(?:^| )([A-Z]):([A-Z])([^ ]*)", prompt.splitlines()[-1])
    if len(actions) != count or [row[0] for row in actions] != [chr(65 + i) for i in range(count)]:
        raise ValueError("Current categorical policy needs the complete ordered action line")
    groups = Counter(code for _, code, _ in actions)
    result = []
    for _, code, facts in actions:
        bias = -math.log(groups[code])
        if code == "U" and re.search(r"q0(?:\D|$)", facts):
            bias += POLICY["noObservedSkillOpportunity"]
        if code == "B" and re.search(r"q0(?:\D|$)", facts):
            bias += POLICY["reservedRoll"] if "r1" in facts else POLICY["emptyRoll"]
        result.append(bias)
    return result
