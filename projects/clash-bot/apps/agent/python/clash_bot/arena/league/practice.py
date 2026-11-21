"""Schedule native terminal interventions from actual, committed training exposure."""

import json
import uuid
from collections import Counter, deque
from pathlib import Path

from clash_bot.files import atomic_json

from ..training.coverage import card_coverage
from ..training.focus_opening import KINDS, goal_decks
from ..training.selfplay import setup_for
from ..training.storage import read_episode, replay_path, seed_for
from .champions import checkpoint, learner_history


def store_priority(root, parent_rules, report):
    """Freeze only scheduling priorities from a compatible coverage audit, never labels or games."""
    eligible = {g.removeprefix("card:") for g in goal_decks() if g.startswith("card:")}
    if report["rulesID"] != parent_rules or set(report["cards"]) != eligible:
        raise ValueError("Priority audit must cover the predecessor's full training pool")
    priority = {}
    for name, counts in report["cards"].items():
        priority[f"card:{name}"] = (
            0 if not counts.get("optimizerTargetRows") else 1 if not counts.get("executed") else 2
        )
    forms = report["formExecutions"]
    for goal in goal_decks():
        kind, name = goal.split(":")
        if kind != "card":
            field = "evolvedDeployments" if kind == "evolution" else "abilityUses"
            priority[goal] = int(bool(forms[field].get(name)))
    atomic_json(
        root / "practice-priority.json",
        {
            "sourceRulesID": parent_rules,
            "sourceGames": report["completedTrainingGames"],
            "priority": priority,
        },
        compact=True,
    )


def initialize_priority(root, parent, rules):
    path = root / "practice-priority.json"
    if path.exists() or parent is None or not (parent / "league.json").exists():
        return
    previous = json.loads((parent / "rules.json").read_bytes())
    if previous["catalogue"] != rules["catalogue"] or previous["cards"] != rules["cards"]:
        return
    league = json.loads((parent / "league.json").read_bytes())
    cards = {name: Counter() for name in rules["cards"]}
    forms = {"evolvedDeployments": Counter(), "abilityUses": Counter()}
    for episode in league["episodes"]:
        cache = parent / "coverage" / (Path(episode).name + ".v4.json")
        if cache.exists():
            entry = json.loads(cache.read_bytes())
        else:
            game = read_episode(episode)
            if not game["completed"] or game["rulesID"] != previous["id"]:
                raise ValueError("Invalid predecessor training episode")
            entry = {"cards": card_coverage([game])["allCards"], "forms": game["formExecutions"]}
        for name, counts in entry["cards"].items():
            cards[name]["executed"] += counts.get("executed", 0)
        for field, counts in forms.items():
            counts.update(entry["forms"][field])
    for metadata in learner_history(parent, league):
        training = metadata["training"]
        for name, count in training.get("optimizerCoverage", {}).get("cardsWithTarget", {}).items():
            cards[name]["optimizerTargetRows"] += count
    store_priority(
        root,
        previous["id"],
        {
            "rulesID": previous["id"],
            "cards": cards,
            "formExecutions": forms,
            "completedTrainingGames": len(league["episodes"]),
        },
    )


def practice_history(root, league, persist=False):
    episodes = league["episodes"]
    path = root / "practice-history.json"
    saved = json.loads(path.read_bytes()) if path.exists() else {}
    start = saved.get("episodes", 0)
    if start and (start > len(episodes) or episodes[start - 1] != saved["last"]):
        saved, start = {}, 0
    tried, verified = Counter(saved.get("attempts")), Counter(saved.get("verified"))
    latest = dict(saved.get("latest", {}))
    for episode in episodes[start:]:
        if not Path(episode).name.startswith("train-focus-"):
            continue
        replay = read_episode(replay_path(episode))
        if not replay["completed"] or replay["rulesID"] != league["rulesID"]:
            raise ValueError("Foreign or unfinished focused training episode")
        trial = replay["practiceTrial"]
        goal = trial["goal"]
        tried[goal] += 1
        labeled = any(row.get("practiceGoal") == goal for row in replay["samples"])
        if trial["verified"] != labeled:
            raise ValueError("Native practice receipt and replay label disagree")
        verified[goal] += int(labeled)
        if labeled:
            latest[goal] = episode
    if persist and start < len(episodes):
        atomic_json(
            path,
            {
                "episodes": len(episodes),
                "last": episodes[-1],
                "attempts": dict(tried),
                "verified": dict(verified),
                "latest": latest,
            },
            compact=True,
        )
    return tried, verified, latest


def select_goals(goals, budget, tried, verified, priorities):
    if not budget:
        return []
    floor = min(verified[g] for g in goals)
    sizes = Counter(g.split(":")[0] for g in goals)
    remaining = {
        kind: deque(
            sorted(
                (g for g in goals if g.startswith(kind + ":") and verified[g] == floor),
                key=lambda g: (tried[g], priorities.get(g, 0), g),
            )
        )
        for kind in KINDS
    }
    completed = {kind: sizes[kind] - len(queue) for kind, queue in remaining.items()}
    limit = min(2, budget) if floor else budget
    result = []
    while any(remaining.values()) and len(result) < limit:
        kind = min((k for k in KINDS if remaining[k]), key=lambda k: completed[k] / sizes[k])
        result.append(remaining[kind].popleft())
        completed[kind] += 1
    return result


def focused_jobs(root, league, rules, version, budget):
    if not budget:
        return []
    decks = goal_decks()
    tried, verified, _latest = practice_history(root, league, persist=True)
    path = root / "practice-priority.json"
    priorities = json.loads(path.read_bytes())["priority"] if path.exists() else {}
    jobs = []
    for index, goal in enumerate(select_goals(decks, budget, tried, verified, priorities)):
        n = tried[goal] + seed_for("focus-seat-deck-lane", goal)
        game_id = f"train-focus-{version}-{index}-{uuid.uuid4().hex[:8]}"
        seat = n % 2
        name = sorted(decks[goal])[n % len(decks[goal])]
        jobs.append(
            {
                "id": game_id,
                "index": index,
                "seat": seat,
                "selected": None,
                "rulesID": rules["id"],
                "current": str(checkpoint(root, league["champion"])),
                "labelReference": str(checkpoint(root, league["learner"])),
                "setup": {
                    **setup_for(game_id),
                    "decks": [name, name],
                    "phase": 0,
                    "focusGoal": goal,
                    "focusSeat": seat,
                    "focusLane": 3.5 if (n // 2) % 2 else 14.5,
                    "focusContext": n % 4,
                },
            }
        )
    return jobs
