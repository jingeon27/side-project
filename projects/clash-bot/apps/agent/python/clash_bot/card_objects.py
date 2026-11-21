"""Follow creation edges in the pinned table. Target filters can name unrelated units."""

GRAPH_TYPES = {
    "CharacterType": "units",
    "ProjectileType": "projectiles",
    "AreaEffectType": "area_effect_objects",
    "BuffType": "buffs",
}
FIELDS = {
    "units": frozenset(
        """summon_character character character2 characters unit air_unit attached_character
        spawn_character into morph active mount ghost goblin general spectral cloned_version grounded left right
        card clone SpawnCharacter SpawnCharacter2 DeathSpawnCharacter DeathSpawnCharacter2
        DeathSpawnCharacter3 AttachedCharacter SpawnPathfindMorph""".split()
    ),
    "projectiles": frozenset(
        """projectile spawn_projectile death_spawn_projectile deploy_projectile buff_projectile
        Projectile Projectile2 Projectile3 ProjectileSpecial CustomFirstProjectile DeathSpawnProjectile""".split()
    ),
    "area_effect_objects": frozenset(
        """area areas area_effect_object area_effect_on_hit death_area_effect deploy_area_effect
        deploy_spawn_area landing_area spawn_area_object spawn_area_effect_object strike_area
        big small blow""".split()
    ),
    "buffs": frozenset("buff buff_on_damage target_buff idle_buff".split()),
}
FIELD_GROUP = {field: group for group, fields in FIELDS.items() for field in fields}
SKIP = {"tables", "provenance", "defaults_applied", "target", "filter", "card_data_for_stats"}


def created_by_form(table, form):
    extra = form.get("tables") or {}
    sources = {group: table[group] | extra.get(group, {}) for group in FIELDS}
    found = {group: set() for group in sources}

    def resolve(group, name):
        if name not in sources[group] or name in found[group]:
            return
        found[group].add(name)
        visit(sources[group][name])

    def visit(value, field=None):
        group = FIELD_GROUP.get(field)
        if isinstance(value, list):
            for item in value:
                visit(item, field)
        elif isinstance(value, dict):
            if group and isinstance(value.get("name"), str):
                resolve(group, value["name"])
            for key, item in value.items():
                if key not in SKIP:
                    visit(item, key)
        elif isinstance(value, str):
            if group:
                resolve(group, value)
            elif field == "spawns":
                kind, _, name = value.partition(":")
                if kind in GRAPH_TYPES:
                    resolve(GRAPH_TYPES[kind], name)
            elif field == "spawn":
                # Area schedules use an untyped reference to another area.
                resolve("area_effect_objects", value)

    visit(form)
    return {group: sorted(names) for group, names in found.items()}


def body_labels(catalogue, created, card):
    labels = {
        catalogue["units"][unit]
        for refs in created.values()
        for unit in refs["units"]
        if catalogue["units"].get(unit) not in (None, "?")
    }
    if card in catalogue["bodies"]:
        labels.add(card)
    if card == "barbarian_barrel" and "barrel" in catalogue["bodies"]:
        labels.add("barrel")
    return sorted(labels)
