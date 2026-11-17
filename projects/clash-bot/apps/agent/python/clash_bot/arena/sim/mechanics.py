"""Controlled native fields, not recordings of the real client or training episodes."""

import json

from .rules import CARD_ID, FIELDS, TILE, deck_ids, forms_of, new_battle


def field(own="counterpush", enemy="counterpush", first=None, units=()):
    battle = new_battle()
    order = deck_ids(own)
    if first is not None:
        order = [CARD_ID[first], *[card for card in order if card != CARD_ID[first]]]
    decks = [order, deck_ids(enemy)]
    battle.reset(
        seed=17,
        decks=decks,
        shuffle=0,
        start_tick=100,
        elixir_milli=[10000, 10000],
        tower_hp=None,
        spawns=[],
        forms=[forms_of(name, cards) for name, cards in zip((own, enemy), decks)],
        unit_spawns=[
            (name, team, round(x * TILE), round(y * TILE), hp, 11, 0)
            for name, team, x, y, hp in units
        ],
    )
    return battle


def bodies(battle):
    types = json.loads(battle.unit_types_json())
    return [
        (types[row[FIELDS["unit_type"]]], row)
        for row in json.loads(battle.state_json())["entities"]
        if row[FIELDS["card_id"]] >= 0
    ]


def cast(battle, x, y):
    result = battle.step([(0, 0, round(x * TILE), round(y * TILE))], 1)
    if not result or result[0][1] != 0:
        raise ValueError(f"Verification command rejected: {result}")


def drill_barrel():
    """A low-HP drill expires into Goblins; a rolling barrel destroys it and its contents."""
    runs = []
    for rolling in (False, True):
        battle = field(
            enemy="drill_control", first="BarbLog", units=[("GoblinDrill", 1, 9, 12, 200)]
        )
        if rolling:
            cast(battle, 9, 11)
        seen, death, survivors = set(), None, None
        for _ in range(55):
            rows = bodies(battle)
            seen.update(name for name, _ in rows)
            tick = json.loads(battle.state_json())["tick"]
            if death is None and not any(name == "GoblinDrill" for name, _ in rows):
                death = tick
            # Death children may exist for one spawn frame before the rolling hit removes
            # them. Count survivors after that frame, not whether they ever existed.
            if death is not None and tick == death + 1:
                survivors = sum(name == "Goblin" for name, _ in rows)
            battle.step([], 1)
        runs.append(
            {
                "goblinSeen": "Goblin" in seen,
                "drillDeathTick": death,
                "goblinsAfterDeathFrame": survivors,
            }
        )
    return {
        "passed": runs[0]["goblinSeen"]
        and runs[0]["goblinsAfterDeathFrame"] > 0
        and runs[1]["goblinsAfterDeathFrame"] == 0
        and runs[1]["drillDeathTick"] < runs[0]["drillDeathTick"],
        "natural": runs[0],
        "barrel": runs[1],
    }


def poison_exposure():
    """The same moving Giant takes less damage after leaving the poison's area sooner."""
    hp = []
    for center in (None, 22, 25):
        battle = field(enemy="giant_beatdown", first="Poison", units=[("Giant", 1, 9, 22, -1)])
        if center is not None:
            cast(battle, 9, center)
        battle.step([], 180 if center is None else 179)
        giant = next(row for name, row in bodies(battle) if name == "Giant")
        hp.append(giant[FIELDS["hp"]])
    return {
        "passed": hp[0] > hp[2] > hp[1] > 0,
        "hpAfterNineSeconds": dict(zip(("noPoison", "centered", "trailingEdge"), hp)),
        "observation": "matched_native_fields_with_movement_and_poison_ticks",
    }


def ice_wizard_arrival():
    """The deck's hero-form Ice Wizard removes a Skeleton on arrival in a paired field."""
    survivors = []
    for deploy in (False, True):
        battle = field(first="IceWizard", units=[("Skeleton", 1, 9, 14, -1)])
        if deploy:
            cast(battle, 9, 14)
        battle.step([], 24 if not deploy else 23)
        survivors.append(sum(name == "Skeleton" for name, _ in bodies(battle)))
    return {
        "passed": survivors == [1, 0],
        "skeletonsWithoutDeploy": survivors[0],
        "skeletonsWithDeploy": survivors[1],
        "elapsedTicks": 24,
    }


def graveyard_defense():
    hp = []
    for defend in (False, True):
        battle = field(first="Poison")
        enemy = json.loads(battle.state_json())["players"][1]["hand"].index(CARD_ID["Graveyard"])
        point = (round(3.5 * TILE), round(6.5 * TILE))
        commands = [(1, enemy, *point)] + ([(0, 0, *point)] if defend else [])
        results = battle.step(commands, 240)
        if any(row[1] != 0 for row in results):
            raise ValueError(f"Verification command rejected: {results}")
        hp.append(sum(json.loads(battle.state_json())["players"][0]["tower_hp"]))
    return {"passed": hp[1] > hp[0], "unansweredTowerHP": hp[0], "defendedTowerHP": hp[1]}
