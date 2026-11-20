"""Raw forms, summon chains and units in the pinned client table, independent of the policy vectors."""

import json

from clash_bot.downloads import digest
from clash_bot.files import atomic_json
from clash_bot.paths import CONTRACTS_DIR, DATA_DIR

RULES = json.loads((CONTRACTS_DIR / "arena.json").read_bytes())


def linked_objects(table, catalogue, forms, card):
    # Follow only structured references to named units, projectiles or areas. Avoid backtracking
    # from a shared skeleton to every card that can spawn it.
    tables = [table[k] for k in ("units", "projectiles", "area_effect_objects")]
    found = set()
    visited = set()

    def visit(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key not in (
                    "display_name",
                    "damage_source",
                    "provenance",
                    "rarity",
                    "defaults_applied",
                ):
                    visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, str) and value not in visited:
            visited.add(value)
            name = catalogue["units"].get(value)
            if name and name != "?":
                found.add(name)
            for group in tables:
                if value in group:
                    visit(group[value])

    for row in forms.values():
        visit(row)
    if card in catalogue["bodies"]:
        found.add(card)
    if card == "barbarian_barrel" and "barrel" in catalogue["bodies"]:
        found.add("barrel")
    return sorted(found)


def combat_stats(row):
    """Raw numbers use the record's rarity-local base level; the untouched scaling table accompanies them."""

    def tiles(field):
        value = row.get(field)
        return None if value is None else value / 1000

    return {
        "aggroRangeTiles": tiles("sight_range_milli"),
        "attackRangeTiles": tiles("range_milli"),
        "minimumAttackRangeTiles": tiles("minimum_range_milli"),
        "collisionRadiusTiles": tiles("collision_radius_milli"),
        "areaDamageRadiusTiles": tiles("area_damage_radius_milli"),
        "hitpoints": row.get("hitpoints"),
        "damage": row.get("damage"),
        "attackIntervalMs": row.get("hit_speed_ms"),
        "firstHitLoadMs": row.get("load_time_ms"),
        "speedRaw": row.get("speed"),
        "deployDelayMs": row.get("deploy_time_ms"),
        "targets": {
            "air": row.get("attacks_air"),
            "ground": row.get("attacks_ground"),
            "buildingsOnly": row.get("target_only_buildings"),
        },
        "levelScaling": row.get("level_scaling"),
    }


def engine_specs(catalogue=None):
    catalogue = catalogue or json.loads((CONTRACTS_DIR / "card-catalogue.json").read_bytes())
    path = DATA_DIR / "arena/rules/source" / RULES["tableFile"]
    if digest(path) != RULES["tableSHA256"]:
        raise ValueError("Pinned card table checksum mismatch")
    table = json.loads(path.read_bytes())
    if table["version"] != catalogue["tableVersion"] or table["version"] != RULES["tableVersion"]:
        raise ValueError("Card table version changed")
    fields = {
        "base": {r["name"]: r for r in table["cards"]},
        "evolution": {r["name"].removesuffix("_EV1"): r for r in table["evolutions"]},
        "hero": {r["name"].removesuffix("_hero"): r for r in table["hero_forms"]},
    }
    cards = {}
    for card, entry in catalogue["cards"].items():
        engine = entry["engine"]
        forms = {k: f[engine] for k, f in fields.items() if engine in f}
        if forms["base"]["rarity"] == "Champion":
            forms["champion"] = forms.pop("base")
        cards[card] = {
            "engine": engine,
            "placement": entry["placement"],
            "forms": forms,
            "combat": {k: combat_stats(r) for k, r in forms.items()},
            "objects": linked_objects(table, catalogue, forms, card),
        }
    linked = {b for entry in cards.values() for b in entry["objects"]}
    missing = catalogue["bodies"].keys() - linked - {"?"}
    towers = {"king_tower", "princess_tower", "chef_tower", "cannoneer", "dagger_duchess"}
    unsupported = {
        catalogue["units"].get(row.get("summon_character")): row["name"]
        for row in table["cards"]
        if row["name"] not in {c["engine"] for c in cards.values()}
    }
    exclusions = {
        b: {
            "reason": "arena_tower" if b in towers else "unsupported_engine_card",
            "source": unsupported.get(b),
        }
        for b in missing
        if b in towers or b in unsupported
    }
    result = {
        "objectOrigins": exclusions,
        "tableVersion": table["version"],
        "tableSHA256": RULES["tableSHA256"],
        "level": RULES["level"],
        "conventions": table["conventions"],
        "units": {
            name: {"raw": unit, "combat": combat_stats(unit), "body": catalogue["units"].get(name)}
            for name, unit in table["units"].items()
        },
        "projectiles": table["projectiles"],
        "effects": table["area_effect_objects"],
        "buffs": table["buffs"],
        "towers": table["towers"],
        "unsupportedCards": {
            row["name"]: row
            for row in table["cards"]
            if row["name"] not in {c["engine"] for c in cards.values()}
        },
        "cards": cards,
        "unlinkedBodies": sorted(missing - exclusions.keys()),
        "unknownSentinel": "?",
    }
    atomic_json(DATA_DIR / "arena/rules/engine-specs.json", result, compact=True)
    return result
