"""Check an actual execution receipt for each catalogued base card, from both sides."""

import json

import royalesim

from ..catalogue import current
from .rules import SPEC, TILE


def deployment(name):
    fillers = ["Knight", "Archer", "Minions", "Giant", "Fireball", "Zap", "Skeletons", "Musketeer"]
    names = list(dict.fromkeys([name, *fillers]))[:8]
    battle = royalesim.Battle(
        card_names=names,
        slot_of_k=[[0, 1, 2], [0, 1, 2]],
        level=SPEC["level"],
        tower_level=SPEC["level"],
        calibration_overrides={"cards.CARD_TABLE": json.dumps(SPEC["table"])},
    )
    deck = list(range(8))
    battle.set_command_delay_ticks(1, 1)
    battle.reset(
        seed=173,
        decks=[deck, deck],
        shuffle=0,
        start_tick=0,
        elixir_milli=[10000, 10000],
        tower_hp=None,
        spawns=[],
    )
    battle.step([], 300)
    sides = [(9 * TILE, 10 * TILE), (9 * TILE, 22 * TILE)]
    for _ in range(5):
        players = json.loads(battle.state_json())["players"]
        if all(0 in p["hand"] for p in players):
            break
        # Mirror cannot start in hand. Establish a public first play and cycle it in.
        moves = [(i, 0, *sides[i]) for i, p in enumerate(players) if 0 not in p["hand"]]
        battle.step(moves, 280)
    players = json.loads(battle.state_json())["players"]
    if not all(0 in p["hand"] for p in players):
        return {"passed": False, "reason": "card_not_drawn"}
    moves = [(i, p["hand"].index(0), *sides[i]) for i, p in enumerate(players)]
    accepted = battle.step(moves, 40)
    receipts = battle.step_commands_run()
    executed = {r[1] for r in receipts if r[2] == "deploy" and r[3] == 0 and r[4] == 0}
    return {
        "passed": all(r[1] == 0 for r in accepted) and executed == {0, 1},
        "acceptanceCodes": [r[1] for r in accepted],
        "executedSides": sorted(executed),
    }


def catalogue_deployments():
    results = {}
    for card, row in current().catalogue.cards.items():
        try:
            results[card] = deployment(row.engine)
        except (ValueError, RuntimeError) as exc:
            results[card] = {"passed": False, "reason": str(exc)}
    return {"passed": all(r["passed"] for r in results.values()), "byCard": results}
