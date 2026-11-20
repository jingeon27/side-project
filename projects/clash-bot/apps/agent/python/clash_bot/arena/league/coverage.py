"""Audit completed self-play and published optimizer batches without counting validation games."""

import json
from collections import Counter
from pathlib import Path

from clash_bot.files import atomic_json

from ..sim.rules import CARDS, rules_identity
from ..training.coverage import card_coverage
from ..training.storage import read_episode


def training_coverage(root, league):
    rules = rules_identity()["id"]
    if league["rulesID"] != rules:
        raise ValueError("Active league and card catalogue differ")
    counts = {name: Counter() for name in CARDS}
    for episode in league["episodes"]:
        path = Path(episode)
        cache = root / "coverage" / (path.name + ".json")
        if cache.exists():
            small = json.loads(cache.read_bytes())
        else:
            game = read_episode(path)
            if game["rulesID"] != rules or not game["completed"]:
                raise ValueError("Unsealed or foreign training episode")
            small = card_coverage([game])["allCards"]
            atomic_json(cache, small, compact=True)
        for name, facts in small.items():
            counts[name].update(facts)
    for path in sorted((root / "checkpoints").glob("v[0-9]*/metadata.json")):
        m = json.loads(path.read_bytes())
        if m["rulesID"] != rules:
            continue
        trained = m.get("training", {}).get("optimizerCoverage", {}).get("cardsWithTarget", {})
        for card, count in trained.items():
            counts[card]["optimizerTargetRows"] += count
    summary = {
        key: sum(v[key] > 0 for v in counts.values())
        for key in ("compared", "searchTarget", "executed", "optimizerTargetRows")
    }
    return {
        "rulesID": rules,
        "completedTrainingGames": len(league["episodes"]),
        "availableCards": len(CARDS),
        "cardsByStage": summary,
        "cards": {card: dict(v) for card, v in counts.items()},
    }
