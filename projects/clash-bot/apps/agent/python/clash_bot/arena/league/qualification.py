"""Whether the new learner replaces the champion: a spent, seat-swapped holdout evaluation."""

from clash_bot.files import atomic_json

from ..policy.network import Policy
from ..training.activity import opening_audit
from ..training.benchmark import benchmark
from ..training.evaluation import evaluate
from ..training.parallel import play_frozen_matchup, play_frozen_pair
from .champions import checkpoint, evaluation_offset, publish_champion, store

CONFIRMATION_PAIRS = 128


def assess(
    control, workers, root, league, rules, learner, champion, frozen, pairs, confirmation_of=None
):
    version = league["learner"]
    number = evaluation_offset(root) + league["evaluations"]
    league["evaluations"] += 1
    store(root, league)  # Spend before play, including crashes.
    result = evaluate(
        learner,
        champion,
        rules["id"],
        number,
        pairs=pairs,
        report=control.report,
        should_stop=control.stopped,
        # The saved checkpoints hold the same weights; workers load them by path.
        play_matchups=lambda jobs: workers.map(
            play_frozen_matchup, [{**job, **frozen} for job in jobs]
        ),
        batch=workers.count,
    )
    result["openingAudit"] = {"tested": False, "passed": False}
    result["openingGames"] = []
    # Monitor every completed evaluation, including candidates that lost the win test.
    # Otherwise a stalled learner could stay invisible while the old champion keeps playing.
    # The audit handles stop requests itself and returns incomplete. Skipping it here could
    # leave a passing win gate without its required opening check.
    if result["complete"]:
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
    if confirmation_of is not None:
        result["confirmationOf"] = confirmation_of
    atomic_json(root / "evaluations" / f"v{version:06d}-e{number:06d}.json", result)
    return number, result


def promising(result):
    if not result["complete"] or not result["openingAudit"]["passed"]:
        return False
    gate = result["gate"]
    return (
        gate["reason"] == "insufficient_evidence_of_improvement"
        and gate["score"] >= 0.55
        and result["poolComparison"]["nonRegressing"]
        and all(result["matchupStrata"][s]["score"] >= 0.5 for s in ("liveMirror", "mixedDeck"))
    )


def qualify(control, workers, root, league, rules, learner, pairs):
    """Only a fully qualified attempt publishes the frozen challenger."""
    version = league["learner"]
    champion = Policy.load(checkpoint(root, league["champion"]), rules["id"])
    frozen = {
        "challenger": str(checkpoint(root, version)),
        "champion": str(checkpoint(root, league["champion"])),
        "rulesID": rules["id"],
    }
    number, result = assess(control, workers, root, league, rules, learner, champion, frozen, pairs)
    if (
        not result["gate"]["passed"]
        and 16 <= pairs < CONFIRMATION_PAIRS
        and promising(result)
        and not control.stopped()
    ):
        control.report(
            {
                "phase": "confirming",
                "screeningEvaluation": number,
                "confirmationPairs": CONFIRMATION_PAIRS,
            }
        )
        _, result = assess(
            control,
            workers,
            root,
            league,
            rules,
            learner,
            champion,
            frozen,
            CONFIRMATION_PAIRS,
            confirmation_of=number,
        )
    if result["gate"]["passed"]:
        league["champion"] = version
        if not any(row["version"] == version for row in league["opponents"]):
            league["opponents"] = (
                league["opponents"] + [{"version": version, "wins": 0, "games": 0}]
            )[-8:]
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
                key: value
                for key, value in result.items()
                if key not in ("games", "openingGames", "poolControlGames")
            },
            "champion": league["champion"],
        }
    )
