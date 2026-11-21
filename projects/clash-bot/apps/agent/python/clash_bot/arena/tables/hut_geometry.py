"""Public Goblin Hut activation distances from the running table and calibrated target rule."""

import json

import royalesim

from clash_bot.paths import CONTRACTS_DIR

PATH = CONTRACTS_DIR / "hut-activation.json"


def build_hut_geometry(catalogue, specs):
    settings = json.loads((royalesim.data_dir() / "calibration.json").read_bytes())["spawner"]
    mode = settings["LIFE_STATE_WAKE_REACH"]["value"]
    extra = {"range_plus_radii_buildings_plus_228": 0.228, "range_plus_radii": 0.0}[mode]
    targets = settings["LIFE_STATE_WAKE_TARGETS"]["value"]
    if targets not in ("enemy_troops_and_buildings", "enemy_troops_only"):
        raise ValueError(f"Unrecognised native hut target rule: {targets}")
    hut = specs["cards"]["goblin_hut"]["forms"]["base"]
    center_to_edge = (hut["range_milli"] + hut["collision_radius_milli"]) / 1000
    crown = {
        key for key, value in specs["objectOrigins"].items() if value["reason"] == "arena_tower"
    }
    building_summons = {
        form["summon_character"]
        for entry in specs["cards"].values()
        for form in entry["forms"].values()
        if form["kind"] == "building" and form.get("summon_character")
    }
    ranges = {}
    for name, unit in specs["units"].items():
        label = catalogue["units"].get(name)
        raw = unit["raw"]
        radius = raw.get("collision_radius_milli")
        if label in (None, "?") or label in crown or radius is None or raw.get("spawn_pathfind"):
            continue
        building = raw["source_table"] == "buildings" or name in building_summons
        if building and targets == "enemy_troops_only":
            continue
        bound = round(center_to_edge + radius / 1000 + (extra if building else 0), 3)
        # Some live labels group multiple forms. Credit only a reach shared by those forms.
        ranges[label] = min(bound, ranges.get(label, bound))
    for card, entry in specs["cards"].items():
        raw = entry["forms"].get("base") or entry["forms"]["champion"]
        body = catalogue["units"].get(raw.get("summon_character"))
        if raw["kind"] != "spell" and body in ranges:
            ranges.setdefault(card, ranges[body])
    return {
        "tableVersion": specs["tableVersion"],
        "nominalRangeTiles": hut["range_milli"] / 1000,
        "sourceRadiusTiles": hut["collision_radius_milli"] / 1000,
        "buildingExtraTiles": extra,
        "centerReachByBody": dict(sorted(ranges.items())),
    }
