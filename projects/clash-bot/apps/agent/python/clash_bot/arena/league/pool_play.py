"""Full matches in which the frozen learner pilots each non-live deck against the champion."""

import uuid
from pathlib import Path

from ..sim.rules import CARD_ID, LIVE_DECK, POOL_ATTACKS, POOL_DECKS
from ..training.selfplay import live_setup
from ..training.storage import seed_for
from .champions import checkpoint


def pool_jobs(root, league, rules, version, settings):
    count = settings["poolGames"]
    if not count:
        return []
    # Only committed games advance the rotation, even if a generation stopped partway through.
    start = sum(Path(path).name.startswith("train-pool-") for path in league["episodes"])
    champion = str(checkpoint(root, league["champion"]))
    learner = str(checkpoint(root, league["learner"]))
    jobs = []
    for offset in range(count):
        lap, index = divmod(start + offset, len(POOL_DECKS))
        deck = POOL_DECKS[index]
        seat = (lap + index) % 2
        game_id = f"train-pool-{version}-{offset}-{uuid.uuid4().hex[:8]}"
        setup = live_setup(seed_for("pool-training-phase", game_id))
        setup["decks"][seat] = deck
        setup["poolLearnerSeat"] = seat
        attacks = POOL_ATTACKS[deck]
        setup["poolAttackCard"] = attacks[(lap % 2 + lap // 2) % len(attacks)]
        jobs.append(
            {
                "id": game_id,
                "seat": seat,
                "setup": setup,
                "current": champion,
                "opponent": champion,
                "collector": learner,
                "labelReference": learner,
                "selected": None,
                "rulesID": rules["id"],
                "simulations": settings["simulations"],
                "depth": settings["depth"],
            }
        )
    return jobs


def deck_receipt(game):
    setup = game["setup"]
    seat = setup.get("poolLearnerSeat")
    if seat is None:
        return None
    if seat not in (0, 1):
        raise ValueError("Unknown learner seat")
    deck = setup["decks"][seat]
    if (
        not game["completed"]
        or game["rejectedCommands"]
        or deck not in POOL_DECKS
        or setup["decks"][1 - seat] != LIVE_DECK
        or game["trainingStartTick"] != 0
    ):
        raise ValueError("Invalid full-deck training receipt")
    rows = game["samples"]
    if any(
        row["team"] != seat
        or row["behavior"] != "deployed_learner"
        or row["learnerDeck"] != deck
        or row["policyVersion"] != game["policies"][seat]["version"]
        for row in rows
    ):
        raise ValueError("Full-deck training labels must belong to the acting learner")
    plays = [
        play["action"][0]
        for event in game["publicHistory"]
        for play in event["plays"]
        if play["team"] == seat and play["action"][0] >= 0
    ]
    attack_cards = {CARD_ID[n] for n in POOL_ATTACKS[deck]}
    target = CARD_ID[setup["poolAttackCard"]]
    hands = [r["observation"]["state"]["players"][seat] for r in rows]
    held = [p for p in hands if target in p["hand"]]
    trials = [r["search"]["attackComparison"] for r in rows if r["search"]["attackComparison"]]
    return {
        "deck": deck,
        "seat": seat,
        "deployments": len(plays),
        "labeledDecisions": len(rows),
        "attackDeployments": sum(card in attack_cards for card in plays),
        "sampledAttackInHand": len(held),
        "sampledUnderCost": sum(
            p["hand_costs"][p["hand"].index(target)] * 1000 > p["elixir_milli"] for p in held
        ),
        "attackComparisons": len(trials),
        "rankedComparisons": sum(bool(t["pair"]) for t in trials),
        "score": 0.5 if game["winner"] == 2 else int(game["winner"] == seat),
    }
