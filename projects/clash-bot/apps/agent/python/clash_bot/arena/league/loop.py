"""Persistent expert iteration, frozen opponents and qualification, on one Mac.

The learner advances after verified terminal games. The champion pointer moves
only after disjoint, seat-swapped evaluation passes.
"""

import json
import shutil
from pathlib import Path

from clash_bot.files import atomic_json

from ..policy.network import LEAGUE_KEY, Policy
from ..sim.rules import rules_identity
from ..sim.verification import verify
from ..training.parallel import Workers
from .champions import checkpoint, initialize
from .control import Control
from .generation import learn, next_version, selfplay
from .practice import initialize_priority
from .qualification import qualify


def open_league(control, data_dir, rules):
    """This rule set's league, started from the league run before it when the rules changed."""
    root = data_dir / "arena/leagues" / f"{rules['id'][:16]}-{LEAGUE_KEY}"
    active = control.directory / "active.json"
    previous = Path(json.loads(active.read_text())["root"]) if active.exists() else None
    league = initialize(root, rules, parent=None if previous == root else previous)
    if previous != root:
        initialize_priority(root, previous, rules)
    atomic_json(active, {"root": str(root), "rulesID": rules["id"]})
    return root, league


def run(
    data_dir,
    hours=8,
    generations=0,
    games=4,
    simulations=16,
    depth=6,
    pairs=16,
    evaluate_every=1,
    workers=1,
    practice_games=0,
    pool_games=0,
):
    data_dir = Path(data_dir)
    settings = {
        "games": games,
        "simulations": simulations,
        "depth": depth,
        "pairs": pairs,
        "evaluateEvery": evaluate_every,
        "workers": workers,
        "practiceGames": practice_games,
        "poolGames": pool_games,
    }
    with Control(data_dir, hours) as control, Workers(workers) as pool:
        rules = rules_identity()
        if not verify(data_dir)["passed"]:
            raise ValueError(
                "Native simulator verification failed; inspect arena/verification before training"
            )
        root, league = open_league(control, data_dir, rules)
        start = json.loads((checkpoint(root, 0) / "metadata.json").read_text())
        control.report(
            {
                "root": str(root),
                "rulesID": rules["id"],
                "inheritedFrom": start.get("inheritedFrom"),
                "champion": league["champion"],
                "learner": league["learner"],
                "settings": settings,
            }
        )
        while not control.stopped() and (
            not generations or control.state["completedGenerations"] < generations
        ):
            if shutil.disk_usage(data_dir).free < 8 * 1024**3:
                raise RuntimeError("Less than 8 GB disk space; stopping before another game")
            learner = Policy.load(checkpoint(root, league["learner"]), rules["id"])
            version = next_version(root, league)
            played = selfplay(control, pool, root, league, rules, version, settings)
            if not played:
                break
            learn(control, root, league, rules, learner, version)
            if version % evaluate_every == 0 and not control.stopped():
                qualify(control, pool, root, league, rules, learner, pairs)
            control.state["completedGenerations"] += 1
            control.report({"phase": "generation_complete"})
    return control.state
