"""Whether the new learner replaces the champion: a spent, seat-swapped holdout evaluation."""

from clash_bot.files import atomic_json

from ..policy.network import Policy
from ..training.benchmark import benchmark
from ..training.evaluation import evaluate
from ..training.parallel import play_frozen_pair
from .champions import checkpoint, publish_champion, store


def qualify(control, workers, root, league, rules, learner, pairs):
    """Evaluate the learner against the champion; a pass moves the pointer and the live file."""
    version = league["learner"]
    champion = Policy.load(checkpoint(root, league["champion"]), rules["id"])
    number = league["evaluations"]
    league["evaluations"] += 1
    store(root, league)  # Spend before play, including crashes.
    frozen = {
        "challenger": str(checkpoint(root, version)),
        "champion": str(checkpoint(root, league["champion"])),
        "rulesID": rules["id"],
    }
    result = evaluate(
        learner,
        champion,
        rules["id"],
        number,
        pairs=pairs,
        report=control.report,
        should_stop=control.stopped,
        # The saved checkpoints hold the same weights; workers load them by path.
        play_pairs=lambda jobs: workers.map(play_frozen_pair, [{**job, **frozen} for job in jobs]),
        batch=workers.count,
    )
    atomic_json(root / "evaluations" / f"v{version:06d}-e{number:06d}.json", result)
    if result["gate"]["passed"]:
        league["champion"] = version
        store(root, league)
        publish_champion(root, league)
        # The new champion against the fixed rule bots: an absolute progress curve.
        measured = benchmark(learner, rules["id"], report=control.report)
        atomic_json(root / "benchmarks" / f"v{version:06d}.json", measured)
        control.report({"benchmark": measured["opponents"]})
    control.report(
        {
            "phase": "evaluated",
            "evaluation": {key: value for key, value in result.items() if key != "games"},
            "champion": league["champion"],
        }
    )
