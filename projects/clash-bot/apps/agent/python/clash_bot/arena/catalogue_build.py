"""Build contracts/card-catalogue.json from the pinned engine's card table.

Every card the engine can simulate and every unit type it can put on the field gets a short vector
of normalized attributes. The fast policy reads cards and bodies through these vectors instead of
one slot per name, so its weights keep their shape when the deck changes and a balance patch only
moves numbers. The values are descriptors from the client table ("evidence, not spec"), not the
engine's exact combat rules.
"""

import json
import math
import re

import royalesim

from clash_bot.files import atomic_json

from .catalogue import PATH, Catalogue, content_id
from .rules import SPEC, new_battle

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
# Units the live screen names differently from their engine record (src/core/knowledge.ts).
UNIT_NAMES = {
    "BarbLogBarbarian": "barbarian",
    "BarrelGoblin": "goblin",
    "FireSpirits": "fire_spirit",
    "Furnace_rework": "furnace",
    "GoblinHut_Rework": "goblin_hut",
    "Graveyard_rework_Skeleton": "skeleton",
    "MiniPekka": "minipekka",
}
# Things the live screen reads as a unit that the engine keeps as a spell: the rolling barrel.
BODY_NAMES = {"barrel": "barbarian_barrel"}
PRESENCE = 0.5
# Engine placement codes (catalogue row [1]) to candidate rules shared with fast-candidates.ts.
PLACEMENTS = {1: "building", 3: "rolling_spell", 4: "tower_spell", 5: "anywhere"}
RANGED_MILLI = 4000


def snake(name):
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name.strip())
    return re.sub(r"[^a-z0-9]+", "_", words.lower()).strip("_")


def unit_body(unit):
    """Evolved and hero forms read as their base unit, as the screen names them."""
    base = re.sub(r"(_EV\d+(_\d+)?|Hero)$", "", unit)
    return UNIT_NAMES.get(unit) or UNIT_NAMES.get(base) or snake(base)


def scaled(value, reference):
    """log(1+x)/log(1+reference), clipped: separates a skeleton from a knight and a golem."""
    return min(1.0, math.log1p(max(0.0, value or 0)) / math.log1p(reference))


def ratio(value, reference):
    return min(1.0, max(0.0, (value or 0) / reference))


def dps(record):
    damage = record.get("damage")
    if damage is None and isinstance(record.get("projectile"), dict):
        damage = record["projectile"].get("damage")
    hit = record.get("hit_speed_ms")
    return (damage or 0) / (hit / 1000) if hit else 0.0


def spawns(record):
    graph = record.get("action_graph") or {}
    return float(bool(record.get("spawner") or graph.get("spawns") or record.get("death_spawn")))


def slows(record):
    buff = record.get("buff_on_damage") or (record.get("buff") if "buff" in record else None)
    if not isinstance(buff, dict):
        return 0.0
    change = buff.get("speed_multiplier_raw") or buff.get("hit_speed_multiplier_raw") or 0
    return ratio(-change, 100)


def unit_vector(record, effect=None):
    building = (record.get("speed") or 0) == 0 and bool(record.get("lifetime_ms"))
    return [
        PRESENCE,
        scaled(record.get("hitpoints"), 4000),
        scaled(dps(record), 400),
        ratio((record.get("range_milli") or 0) / 1000, 12),
        ratio(record.get("speed"), 120),
        float(bool(record.get("attacks_air"))),
        float(bool(record.get("attacks_ground"))),
        float(bool(record.get("target_only_buildings"))),
        float((record.get("flying_height") or 0) > 0),
        ratio(record.get("area_damage_radius_milli"), 4000),
        float(building),
        spawns(record),
        0.0,
        0.0,
        ratio(record.get("lifetime_ms"), 40000),
        slows(record),
    ]


def effect_damage(area):
    buff = area.get("buff") or {}
    seconds = (area.get("life_duration_ms") or 0) / 1000
    return (area.get("damage") or 0) + (buff.get("damage_per_second") or 0) * seconds


def spell_vector(card, area):
    """A spell on the field: a lingering area (poison, graveyard) or a flying or rolling hit."""
    lingering = area if area and (area.get("life_duration_ms") or 0) >= 1000 else None
    projectile = card["projectile"] if isinstance(card.get("projectile"), dict) else {}
    damage = (card.get("damage") or projectile.get("damage") or 0) + (
        effect_damage(area) if area else 0
    )
    radius = (
        card.get("area_damage_radius_milli")
        or (area or {}).get("radius_milli")
        or projectile.get("radius_milli")
    )
    change = ((area or {}).get("buff") or {}).get("speed_multiplier_raw") or 0
    return [
        PRESENCE,
        *[0.0] * 8,
        ratio(radius, 4000),
        0.0,
        float(bool((area or {}).get("spawn_character") or projectile.get("spawn_character"))),
        1.0,
        scaled(damage, 1500),
        ratio((lingering or {}).get("life_duration_ms"), 40000),
        ratio(-change, 100),
    ]


def card_vector(card, row, units, area):
    spell = card["kind"] == "spell"
    count = 0 if spell else card.get("count") or 1
    summoned = units.get(card.get("summon_character") or "", {})
    record = {**summoned, **{key: value for key, value in card.items() if value is not None}}
    projectile = card["projectile"] if isinstance(card.get("projectile"), dict) else {}
    damage = card.get("damage") or projectile.get("damage") or 0
    return [
        ratio(card["elixir"], 10),
        float(card["kind"] == "troop"),
        float(card["kind"] == "building"),
        float(spell),
        ratio(math.log2(1 + count), 4),
        0.0 if spell else scaled((record.get("hitpoints") or 0) * count, 4000),
        0.0 if spell else scaled(dps(record) * count, 400),
        0.0 if spell else ratio((record.get("range_milli") or 0) / 1000, 12),
        0.0 if spell else ratio(record.get("speed"), 120),
        float(bool(record.get("attacks_air"))),
        float(bool(record.get("attacks_ground"))),
        float(bool(record.get("target_only_buildings"))),
        float(bool(row[5]) or (record.get("flying_height") or 0) > 0),
        ratio(
            card.get("area_damage_radius_milli")
            or (area or {}).get("radius_milli")
            or projectile.get("radius_milli"),
            4000,
        ),
        scaled(damage + (effect_damage(area) if area else 0), 1500) if spell else 0.0,
        ratio(
            record.get("lifetime_ms")
            or (area if area and (area.get("life_duration_ms") or 0) >= 1000 else {}).get(
                "life_duration_ms"
            ),
            40000,
        ),
        float(
            spawns(record)
            or bool((area or {}).get("spawn_character"))
            or bool(projectile.get("spawn_character"))
        ),
        max(slows(record), slows(area) if area else 0.0),
    ]


def placement(row, card, area):
    code, kind = row[1], row[8]
    if code == 0 and kind == "TROOP":
        ranged = (card.get("range_milli") or 0) >= RANGED_MILLI
        return "ranged_troop" if ranged else "troop"
    if code == 2 or (code == 0 and kind == "SPELL"):
        return "spawn_spell" if (area or {}).get("spawn_character") else "area_spell"
    return PLACEMENTS.get(code, "unsupported")


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


def pinned_table():
    """The client table compiled into the pinned wheel, the one new_battle() runs."""
    stem = SPEC["tableFile"].removeprefix("cards-").removesuffix(".json").replace("-", "_")
    table = json.loads(getattr(royalesim, f"EMBEDDED_CARDS_{stem}_JSON"))
    if table["version"] != SPEC["tableVersion"] or table["version"] != new_battle().card_table():
        raise ValueError("Embedded card table differs from the pinned rules table")
    return table


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
            "features": rounded(card_vector(card, row, units, area)),
        }
        if card["kind"] == "spell":
            bodies[name] = rounded(spell_vector(card, area))
    unit_bodies = {unit: unit_body(unit) for unit in json.loads(battle.unit_types_json())}
    # Unified card levels scale every hit point column by the same percentage.
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
            bodies[body] = rounded(unit_vector(units[records[0]]))
            if units[records[0]].get("hitpoints"):
                hitpoints[body] = units[records[0]]["hitpoints"] * percent // 100
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


def write():
    body = build()
    atomic_json(PATH, body)
    return {"catalogue": str(PATH), "id": body["id"], "cards": len(body["cards"])}
