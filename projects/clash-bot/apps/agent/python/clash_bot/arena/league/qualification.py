"""Whether the new learner replaces the champion: a spent, seat-swapped holdout evaluation."""

from clash_bot.files import atomic_json

from ..policy.network import Policy
from ..training.activity import opening_audit
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
    result["openingAudit"] = {"tested": False, "passed": False}
    result["openingGames"] = []
    # Monitor every completed evaluation, including candidates that lost the win test.
    # Otherwise a stalled learner could stay invisible while the old champion keeps playing.
    if result["complete"] and not control.stopped():
        control.report({"phase": "opening_audit"})
        audit = opening_audit(
            number,
            play_pairs=lambda jobs: workers.map(
                play_frozen_pair,
                [{**job, **frozen, "champion": frozen["challenger"]} for job in jobs],
            ),
            batch=workers.count,
            should_stop=control.stopped,
        )
        result["openingAudit"] = {key: value for key, value in audit.items() if key != "games"}
        result["openingGames"] = audit["games"]
        if result["gate"]["passed"] and not audit["passed"]:
            result["gate"] = {
                **result["gate"],
                "passed": False,
                "reason": "self_opening_deadlock"
                if audit["complete"]
                else "interrupted_opening_audit",
            }
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
            "evaluation": {
                key: value for key, value in result.items() if key not in ("games", "openingGames")
            },
            "champion": league["champion"],
        }
    )
