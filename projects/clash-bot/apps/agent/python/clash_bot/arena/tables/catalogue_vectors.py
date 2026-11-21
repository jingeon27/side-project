"""Normalized attribute vectors of one client-table record: a card, a unit or a spell effect.

The values are descriptors from the client table ("evidence, not spec"), not the engine's exact
combat rules. catalogue_build.py assembles them into contracts/card-catalogue.json.
"""

import math
import re

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
PRESENCE = 0.5
# Engine placement codes (catalogue row [1]) to candidate rules shared with src/core/fast/candidates.ts.
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


def spawns(record, projectiles):
    graph = record.get("action_graph") or {}
    death_shot = projectiles.get(record.get("death_spawn_projectile")) or {}
    return float(
        bool(
            graph.get("spawns")
            or death_shot.get("spawn_character")
            or any(
                record.get(k)
                for k in ("spawner", "interval_spawner", "life_state_spawner", "death_spawn")
            )
        )
    )


def control_strength(record):
    """A bounded descriptor for the policy. Actual duration, resistance and overlap are simulated."""
    projectile = record.get("projectile")
    shot = projectile if isinstance(projectile, dict) else {}
    buffs = (record.get("buff_on_damage"), record.get("buff"), shot.get("target_buff"))
    slow = max(
        (
            ratio(-(buff.get(key) or 0), 100)
            for buff in buffs
            if isinstance(buff, dict)
            for key in ("speed_multiplier_raw", "hit_speed_multiplier_raw")
        ),
        default=0.0,
    )
    # AttackPushBack is the shooter's own recoil (Firecracker, Sparky).
    push = max(record.get("pushback_milli") or 0, shot.get("pushback_milli") or 0)
    return max(slow, ratio(push, 3000))


def unit_vector(record, projectiles):
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
        spawns(record, projectiles),
        0.0,
        0.0,
        ratio(record.get("lifetime_ms"), 40000),
        control_strength(record),
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
    return [
        PRESENCE,
        *[0.0] * 8,
        ratio(radius, 4000),
        0.0,
        float(bool((area or {}).get("spawn_character") or projectile.get("spawn_character"))),
        1.0,
        scaled(damage, 1500),
        ratio((lingering or {}).get("life_duration_ms"), 40000),
        max(control_strength(card), control_strength(area or {})),
    ]


def card_vector(card, row, units, area, projectiles):
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
            spawns(record, projectiles)
            or bool((area or {}).get("spawn_character"))
            or bool(projectile.get("spawn_character"))
        ),
        max(control_strength(record), control_strength(area or {})),
    ]


def placement(row, card, area):
    code, kind = row[1], row[8]
    if code == 0 and kind == "TROOP":
        ranged = (card.get("range_milli") or 0) >= RANGED_MILLI
        return "ranged_troop" if ranged else "troop"
    if code == 2 or (code == 0 and kind == "SPELL"):
        return "spawn_spell" if (area or {}).get("spawn_character") else "area_spell"
    return PLACEMENTS.get(code, "unsupported")
