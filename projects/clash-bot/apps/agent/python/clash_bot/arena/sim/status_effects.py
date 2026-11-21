"""Describe native effects for training coverage and controlled tests, outside the policy inputs."""

from collections import Counter
from functools import cache

from clash_bot.card_specs import buff_records

from .rules import FIELDS, pinned_table


@cache
def buff_kinds():
    result = {}
    table = pinned_table()
    for buff in buff_records([table["buffs"], table["evolutions"], table["hero_forms"]]):
        name = buff["name"]
        move, attack = (
            buff.get(k) or 0 for k in ("speed_multiplier_raw", "hit_speed_multiplier_raw")
        )
        if move <= -100 and attack <= -100:
            result[name] = "fullStop"
        elif min(move, attack) < 0:
            result[name] = "slow"
    return result


@cache
def family(aliases):
    return frozenset(buff_kinds()[name] for name in aliases.split("|") if name in buff_kinds())


def effects_on(row):
    effects = set()
    for aliases, remaining_ms in row[FIELDS["buffs"]]:
        if remaining_ms > 0:
            effects.update(family(aliases))
    if row[FIELDS["knockback_ticks"]] > 0:
        effects.add("knockback")
    return effects


def control_observations(entities):
    combinations = Counter()
    for row in entities:
        if row[FIELDS["buffs"]] or row[FIELDS["knockback_ticks"]] > 0:
            effects = effects_on(row)
            if effects:
                combinations["+".join(sorted(effects))] += 1
    return combinations
