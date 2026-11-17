"""Declared staging and Hut pull geometry, with legal placements kept available."""

import math

from clash_bot.combat_projection import COMBAT

from .tactics_spec import SPEC


def position_bias(context, action):
    _letter, _kind, card, _cost, x, y = action
    p = SPEC["positions"]
    if card == "goblin_hut":
        huts = [b for b in context["bodies"]["own"] if b["kind"] == "goblin_hut"]
        coverage = sum(
            b["y"] < 18
            and COMBAT["bodies"].get(b["kind"], {}).get("speed") != 0
            and math.hypot(b["x"] - x, b["y"] - y) <= 6
            and not any(math.hypot(b["x"] - h["x"], b["y"] - h["y"]) <= 6 for h in huts)
            for b in context["bodies"]["enemy"]
        )
        stacked = any(math.hypot(x - h["x"], y - h["y"]) < 6 for h in huts)
        poison = any(
            e[0] == "red"
            and e[1] == "poison"
            and (e[4] is None or e[4] < 8)
            and math.hypot(x - e[2], y - e[3]) < COMBAT["poison"]["radius"] + 0.7
            for e in context.get("effects", [])
        )
        return (
            coverage * p["hutCoverageWeight"]
            - abs(x - p["hutX"]) * p["hutXWeight"]
            - abs(y - p["hutY"]) * p["hutYWeight"]
            - max(0, y - p["hutFrontY"]) * p["hutFrontWeight"]
            + (COMBAT["policy"]["redundantHut"] if stacked else 0)
            + (p["hutPoisonWeight"] if poison else 0)
        )
    if card not in ("knight", "furnace", "ice_wizard", "skeletons"):
        return 0
    urgent = (
        context["deployments"]
        or any(b["y"] < 18 for b in context["bodies"]["enemy"])
        or any(e[0] == "red" and e[1] == "graveyard" for e in context.get("effects", []))
    )
    supported = any(b["y"] > 16 and abs(b["x"] - x) < 4.5 for b in context["bodies"]["own"])
    if urgent or supported:
        return 0
    return (
        -max(0, y - p["stagingY"]) * p["frontWeight"] / 4
        - min(abs(x - lane) for lane in (3.5, 14.5, 8, 10)) * p["laneWeight"]
    )
