"""Compare counters to the remaining spawn area and time of an observed Graveyard."""

import math

from clash_bot.combat_projection import COMBAT

from ..catalogue import current
from .tactics_spec import SPEC

CATALOGUE = current()
GROUND = CATALOGUE.catalogue.cardFeatures.index("groundTargets")
TROOP = CATALOGUE.catalogue.cardFeatures.index("troop")
SPLASH = CATALOGUE.catalogue.cardFeatures.index("splash")


def counter_strength(card):
    if card in SPEC["graveyardDefense"]:
        return SPEC["graveyardDefense"][card]
    features = CATALOGUE.cards.get(card)
    if features is None or not features[TROOP] or not features[GROUND]:
        return 0
    return 0.45 + 0.65 * float(features[SPLASH])


def remaining(effect, duration):
    return duration / 2 if effect[4] is None else max(0, duration - effect[4])


def coverage(x, y, effect, radius):
    return max(0.0, 1 - math.hypot(x - effect[2], y - effect[3]) / radius)


def graveyard_defense(context, action):
    _, _, card, _, x, y = action
    effects = context.get("effects", [])
    poison_duration = COMBAT["poison"]["duration"]
    poison_radius = COMBAT["poison"]["radius"]
    deploy = {
        "poison": COMBAT["poison"]["deploySeconds"],
        "ice_wizard": COMBAT["ice_wizard"]["deploySeconds"],
        "graveyard": SPEC["graveyardFirstSpawnSeconds"],
    }
    cast_delay = COMBAT["inputDelaySeconds"] + deploy.get(card, 1)
    strength = 0 if card == "graveyard" and y >= 16 else counter_strength(card)
    pressure = response = 0.0
    for grave in effects:
        if grave[0] != "red" or grave[1] != "graveyard" or grave[3] >= 16:
            continue
        time = remaining(grave, SPEC["graveyardSeconds"])
        if time == 0:
            continue
        existing = max(
            (
                coverage(poison[2], poison[3], grave, poison_radius + 0.5)
                * min(1, remaining(poison, poison_duration) / time)
                for poison in effects
                if poison[0] == "blue" and poison[1] == "poison"
            ),
            default=0,
        )
        urgency = min(1, time / 3) * (1 - existing)
        pressure = max(pressure, urgency)
        if not strength:
            continue
        ranges = {
            "poison": poison_radius + 0.5,
            "ice_wizard": 5,
            "graveyard": COMBAT["policy"]["graveyardSpawnRadius"],
        }
        radius = ranges.get(card, SPEC["engagementRadius"])
        fit = coverage(x, y, grave, radius)
        if card in ("skeletons", "ice_wizard", "graveyard") and any(
            poison[0] == "red"
            and poison[1] == "poison"
            and remaining(poison, poison_duration) > cast_delay
            and math.hypot(x - poison[2], y - poison[3]) <= poison_radius
            for poison in effects
        ):
            fit *= 0.5 if card == "ice_wizard" else 0.1
        benefit = urgency * strength * fit * min(1, max(0, time - cast_delay) / 2)
        response = max(response, benefit)
    return pressure, response
