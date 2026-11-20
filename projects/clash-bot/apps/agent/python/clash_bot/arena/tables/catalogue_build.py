"""Build contracts/card-catalogue.json from the pinned engine's card table.

Every card the engine can simulate and every unit type it can put on the field gets a short vector
of normalized attributes. The fast policy reads cards and bodies through these vectors instead of
one slot per name, so its weights keep their shape when the deck changes and a balance patch only
moves numbers. The values are descriptors from the client table ("evidence, not spec"), not the
engine's exact combat rules.
"""

import json

import royalesim

from clash_bot.card_specs import engine_specs
from clash_bot.files import atomic_json

from ..catalogue import PATH, Catalogue, content_id
from ..sim.rules import SPEC, new_battle, pinned_table
from .catalogue_vectors import (
    PRESENCE,
    card_vector,
    placement,
    snake,
    spell_vector,
    unit_body,
    unit_vector,
)

FORMAT = "clash-card-catalogue-v1"
CARD_FEATURES = (
    "elixir",
    "troop",
    "building",
    "spell",
    "count",
    "hitpoints",
    "dps",
    "range",
    "speed",
    "airTargets",
    "groundTargets",
    "buildingTargets",
    "flying",
    "splash",
    "spellDamage",
    "lifetime",
    "spawns",
    "control",
)
BODY_FEATURES = (
    "presence",
    "hitpoints",
    "dps",
    "range",
    "speed",
    "airTargets",
    "groundTargets",
    "buildingTargets",
    "flying",
    "splash",
    "building",
    "spawns",
    "effect",
    "effectDamage",
    "lifetime",
    "control",
)
# The live screen's names where the client's display name differs (src/core/cards.ts).
CARD_NAMES = {"BarbLog": "barbarian_barrel", "MiniPekka": "minipekka"}
# Things the live screen reads as a unit that the engine keeps as a spell: the rolling barrel.
BODY_NAMES = {"barrel": "barbarian_barrel"}


def simulable(name):
    """Cards the engine refuses to load (a mechanic outside its columns) are left out."""
    try:
        battle = royalesim.Battle(
            card_names=[name],
            slot_of_k=[[0, 1, 2], [0, 1, 2]],
            level=SPEC["level"],
            tower_level=SPEC["level"],
            calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
        )
    except ValueError:
        return None
    return json.loads(battle.catalogue_json())[0]


def rounded(vector):
    return [round(float(value), 4) for value in vector]


def build():
    battle = new_battle()
    table = pinned_table()
    units, areas = table["units"], table["area_effect_objects"]
    cards, bodies, taken = {}, {}, set()
    # Shorter engine names first: the base card keeps the display name an event variant shares.
    for card in sorted(table["cards"], key=lambda row: (len(row["name"]), row["name"])):
        row = simulable(card["name"])
        if row is None:
            continue
        name = CARD_NAMES.get(card["name"]) or snake(card["display_name"] or card["name"])
        if name in taken:
            name = snake(card["name"])
        taken.add(name)
        area = areas.get(card["name"]) if card["kind"] == "spell" else None
        cards[name] = {
            "engine": card["name"],
            "elixir": card["elixir"],
            "placement": placement(row, card, area),
            "features": rounded(card_vector(card, row, units, area, table["projectiles"])),
        }
        if card["kind"] == "spell":
            bodies[name] = rounded(spell_vector(card, area))
    unit_bodies = {unit: unit_body(unit) for unit in json.loads(battle.unit_types_json())}
    # Ordinary bodies use the unified card level. Crown towers use their own ladder below.
    percent = next(row for row in table["cards"] if row["name"] == "Knight")["level_scaling"][
        "multiplier_percent_by_level"
    ][SPEC["level"] - 1]
    hitpoints = {}
    # One vector per body: the base record (no evolution or hero suffix, then shortest name).
    for body in sorted(set(unit_bodies.values())):
        records = sorted(
            (unit for unit, value in unit_bodies.items() if value == body and unit in units),
            key=lambda unit: ("_EV" in unit or "Hero" in unit, len(unit), unit),
        )
        if records and body not in bodies:
            bodies[body] = rounded(unit_vector(units[records[0]], table["projectiles"]))
            if units[records[0]].get("hitpoints"):
                hitpoints[body] = units[records[0]]["hitpoints"] * percent // 100
    # Crown towers have their own level ladder, including when their raw rarity reads Common.
    battle.reset(
        seed=0,
        decks=[list(range(8))] * 2,
        shuffle=0,
        start_tick=0,
        elixir_milli=[5000, 5000],
        tower_hp=None,
        spawns=[],
    )
    king, princess, _other = json.loads(battle.state_json())["players"][0]["tower_max_hp"]
    hitpoints.update(king_tower=king, princess_tower=princess)
    # A unit without a record of its own (a tower) reads as an unknown body.
    unit_bodies = {unit: body if body in bodies else "?" for unit, body in unit_bodies.items()}
    # A field unit the screen names by its card (an "archers" unit) reads the card's unit.
    summons = {row["name"]: row.get("summon_character") for row in table["cards"]}
    for name, card in cards.items():
        summoned = unit_bodies.get(summons.get(card["engine"]) or "")
        if name not in bodies and summoned and summoned != "?":
            bodies[name] = bodies[summoned]
            if summoned in hitpoints:
                hitpoints[name] = hitpoints[summoned]
    for name, source in BODY_NAMES.items():
        bodies[name] = bodies[source]
    bodies["?"] = rounded([PRESENCE] + [0.0] * (len(BODY_FEATURES) - 1))
    body = {
        "format": FORMAT,
        "id": "",
        "tableVersion": table["version"],
        "tableFNV": battle.card_table_fnv1a64(),
        "cardFeatures": list(CARD_FEATURES),
        "bodyFeatures": list(BODY_FEATURES),
        "cards": dict(sorted(cards.items())),
        "bodies": dict(sorted(bodies.items())),
        # Full hit points at the arena level: a seen health bar or HP reads as a fraction of it.
        "bodyHitpoints": dict(sorted(hitpoints.items())),
        "units": dict(sorted(unit_bodies.items())),
    }
    return {**body, "id": content_id(Catalogue.model_validate(body))}


def write_contract(path, value):
    # Keep the repository formatter's layout when the pinned data did not change.
    try:
        if json.loads(path.read_bytes()) == value:
            return
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    atomic_json(path, value)


def write():
    from .hut_geometry import PATH as hut_path
    from .hut_geometry import build_hut_geometry
    from .practice_pool import PATH as practice_path
    from .practice_pool import verified_pool

    body = build()
    specs = engine_specs(body)
    write_contract(hut_path, build_hut_geometry(body, specs))
    write_contract(practice_path, verified_pool(body, specs, SPEC))
    write_contract(PATH, body)
    return {
        "catalogue": str(PATH),
        "id": body["id"],
        "cards": len(body["cards"]),
        "specTableSHA256": specs["tableSHA256"],
    }
