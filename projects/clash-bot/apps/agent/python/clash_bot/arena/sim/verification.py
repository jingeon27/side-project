"""Reproducible simulation gates and an explicit limit on what they establish.

Native consistency is not client parity. No passing check is labelled real-client evidence.
"""

from datetime import datetime, timezone
from pathlib import Path

from clash_bot.files import atomic_json

from . import mechanics
from .candidates import legal_actions
from .elixir import public_mana
from .engine import Arena
from .rules import CARDS, DECKS, Action, deck_ids, rules_identity


def pool_deployments():
    plays = 0
    for name in sorted(DECKS):
        for card in deck_ids(name):
            order = [card, *[other for other in deck_ids(name) if other != card]]
            arena = Arena(17, [order, order], [name, name])
            arena.play([Action(-1)] * 2, 300)
            move = next(action for action in legal_actions(arena.battle, 0) if action.card == card)
            results = arena.play([move, Action(-1)], 40)
            if any(row[1] != 0 for row in results):
                raise ValueError(f"{name}/{CARDS[card]} was rejected")
            state = arena.state()
            if (
                abs(
                    public_mana(arena.history, state["tick"], 0)
                    - state["players"][0]["elixir_milli"] / 1000
                )
                > 0.05
            ):
                raise ValueError(f"{name}/{CARDS[card]} public elixir ledger differs")
            plays += 1
    return {
        "passed": True,
        "deckCardDeployments": plays,
        "distinctCards": len(CARDS),
        "decks": len(DECKS),
    }


CHECKS = {
    "poolDeploymentsAndElixir": pool_deployments,
    "drillBarrelDeathSpawn": mechanics.drill_barrel,
    "poisonMovingExposure": mechanics.poison_exposure,
    "iceWizardArrivalDamage": mechanics.ice_wizard_arrival,
    "graveyardPoisonDefense": mechanics.graveyard_defense,
}


def cancelled_skill():
    arena = Arena(17, delays=(22, 22))
    arena.battle = mechanics.field(
        units=[("IceWizardHero", 0, 9, 14, 1), ("Skeleton", 1, 9, 14.6, -1)],
        delays=(22, 22),
    )
    accepted = arena.play([Action(-2), Action(-1)], 40)
    receipts = arena.battle.step_commands_run()
    return {
        "passed": accepted[0][1] == 0
        and receipts[0][-1] != 0
        and arena.history == []
        and arena.state()["players"][0]["elixir_milli"] == 10000,
        "accepted": accepted,
        "executedOrDropped": receipts,
        "publicSpends": len(arena.history),
    }


CHECKS["cancelledDelayedSkill"] = cancelled_skill


def verify(data_dir):
    rules = rules_identity()
    checks = {}
    for name, check in CHECKS.items():
        try:
            checks[name] = check()
        except Exception as error:
            checks[name] = {"passed": False, "error": str(error)}
    result = {
        "format": "clash-simulator-verification-v1",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "rulesID": rules["id"],
        "engineVersion": rules["engineVersion"],
        "table": rules["table"],
        "passed": all(row["passed"] for row in checks.values()),
        "evidence": "controlled_native_simulation",
        "realClientParityVerified": False,
        "checks": checks,
        "unverified": [
            "live targeting/collision parity",
            "all skills/evolutions",
            "current balance parity",
        ],
    }
    atomic_json(Path(data_dir) / "arena/verification" / f"{rules['id']}.json", result)
    return result
