"""Audit completed self-play and published optimizer batches without counting validation games."""

import json
from collections import Counter
from pathlib import Path

from clash_bot.files import atomic_json

from ..sim.rules import CARD_ID, CARDS, DECKS, LIVE_DECK, rules_identity
from ..training.coverage import card_coverage
from ..training.focus_opening import KINDS, goal_decks
from ..training.form_usage import form_counts
from ..training.storage import read_episode
from .champions import learner_history
from .practice import practice_history


def feedback_counts(samples):
    counts = Counter()
    for row in samples:
        counts["learnerDecisions"] += row["behavior"] == "deployed_learner"
        trial = row["search"]["attackComparison"]
        if not trial:
            continue
        counts["matchedTrials"] += 1
        cards = {i: a[0] for i, a in zip(trial["tried"], trial["actions"], strict=True)}
        counts["graveyardAvailable"] += CARD_ID["Graveyard"] in cards.values()
        if trial["pair"]:
            preferred = cards[trial["pair"][0]]
            counts["rankedTrials"] += 1
            counts["preferredWait"] += preferred == -1
            counts["preferredGraveyard"] += preferred == CARD_ID["Graveyard"]
    return counts


def mirror_plays(games):
    roles = ("challenger", "champion")
    used = {role: Counter(dict.fromkeys((*DECKS[LIVE_DECK].cards, "ability"), 0)) for role in roles}
    openings = {role: Counter() for role in roles}
    mirror_games = 0
    for game in games:
        if game["setup"]["decks"] != [LIVE_DECK, LIVE_DECK]:
            continue
        mirror_games += 1
        opened = set()
        for event in game["publicHistory"]:
            for play in event["plays"]:
                card = play["action"][0]
                if card == -1:
                    continue
                role = "challenger" if play["team"] == game["challengerSeat"] else "champion"
                name = "ability" if card == -2 else CARDS[card]
                used[role][name] += 1
                if card >= 0 and role not in opened:
                    openings[role][name] += 1
                    opened.add(role)
    return {"games": mirror_games, "executed": used, "openingCards": openings}


def latest_evaluation(root, rules):
    """Read frozen holdout receipts so practiced choices can be checked in actual matches."""
    for path in sorted((root / "evaluations").glob("v*-e*.json"), reverse=True):
        record = json.loads(path.read_bytes())
        if (
            not record["complete"]
            or record["rulesID"] != rules
            or record["seedDomain"] != "holdout"
            or record["trainingGamesIncluded"]
        ):
            continue
        return {
            "evaluation": record["generation"],
            "challenger": record["challenger"]["version"],
            "champion": record["champion"]["version"],
            "games": len(record["games"]),
            "gate": record["gate"],
            "matchupStrata": record["matchupStrata"],
            "mirror": mirror_plays(record["games"]),
        }
    return None


def training_coverage(root, league):
    rules = rules_identity()["id"]
    if league["rulesID"] != rules:
        raise ValueError("Active league and card catalogue differ")
    counts = {name: Counter() for name in CARDS}
    forms = form_counts()
    control_frames = Counter()
    feedback = Counter()
    for episode in league["episodes"]:
        path = Path(episode)
        cache = root / "coverage" / (path.name + ".v4.json")
        if cache.exists():
            small = json.loads(cache.read_bytes())
        else:
            game = read_episode(path)
            if game["rulesID"] != rules or not game["completed"]:
                raise ValueError("Unsealed or foreign training episode")
            small = {
                "cards": card_coverage([game])["allCards"],
                "forms": game.get("formExecutions", {}),
                "controlUnitFrames": game.get("controlUnitFrames", {}),
                "feedback": feedback_counts(game["samples"]),
            }
            atomic_json(cache, small, compact=True)
        for name, facts in small["cards"].items():
            counts[name].update(facts)
        for key, values in small["forms"].items():
            forms[key].update(values)
        control_frames.update(small["controlUnitFrames"])
        feedback.update(small["feedback"])
    goals = Counter()
    for metadata in learner_history(root, league):
        optimizer = metadata["training"]["optimizerCoverage"]
        trained = optimizer["cardsWithTarget"]
        goals.update(optimizer["practiceGoals"])
        for card, count in trained.items():
            counts[card]["optimizerTargetRows"] += count
    summary = {
        key: sum(v[key] > 0 for v in counts.values())
        for key in ("compared", "searchTarget", "executed", "optimizerTargetRows")
    }
    tried, verified, _latest = practice_history(root, league)

    def practice_group(pool):
        return {
            "available": len(pool),
            "attempts": sum(tried[g] for g in pool),
            "verified": sum(verified[g] > 0 for g in pool),
            "optimizer": sum(goals[g] > 0 for g in pool),
            "missing": [g.split(":")[1] for g in pool if not goals[g]],
        }

    focused = {
        kind: practice_group(sorted(g for g in goal_decks() if g.startswith(kind + ":")))
        for kind in KINDS
    }
    baseline = None
    priority_path = root / "practice-priority.json"
    if priority_path.exists():
        audit = json.loads(priority_path.read_bytes())
        baseline = {
            "sourceRulesID": audit["sourceRulesID"],
            "sourceGames": audit["sourceGames"],
            **{
                label: practice_group(
                    sorted(
                        g
                        for g, rank in audit["priority"].items()
                        if g.startswith("card:") and rank == priority
                    )
                )
                for priority, label in enumerate(("untrained", "comparedOnly"))
            },
        }
    return {
        "rulesID": rules,
        "completedTrainingGames": len(league["episodes"]),
        "availableCards": len(CARDS),
        "focusedPractice": focused,
        "practiceBaseline": baseline,
        "availableForms": {
            name: len(
                {
                    card
                    for deck in DECKS.values()
                    for card, form in zip(deck.cards, deck.forms)
                    if form == flag
                }
            )
            for name, flag in (("evolution", 1), ("hero", 2))
        },
        "formExecutions": forms,
        "controlUnitFrames": dict(control_frames),
        "trainingFeedback": dict(feedback),
        "latestEvaluation": latest_evaluation(root, rules),
        "cardsByStage": summary,
        "cards": {card: dict(v) for card, v in counts.items()},
    }
