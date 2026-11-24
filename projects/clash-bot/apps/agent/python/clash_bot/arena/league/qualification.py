"""Whether a frozen learner can replace the champion after independent paired evaluation."""

import json

from clash_bot.files import atomic_json

from ..policy.network import Policy
from ..sim.rules import POOL_DECKS
from ..training.activity import opening_audit
from ..training.benchmark import benchmark
from ..training.evaluation import CONFIRMATION_PLAN, MINIMUM_SCORE, evaluate, paired_gate
from ..training.parallel import play_frozen_matchup, play_frozen_pair
from .champions import checkpoint, evaluation_offset, publish_champion, store


def next_evaluation(root, league):
    number = evaluation_offset(root) + league["evaluations"]
    league["evaluations"] += 1
    store(root, league)
    return number


def model_reference(policy):
    return {"version": policy.metadata["version"], "weightsSHA256": policy.checksum()}


def evaluation_file(root, version, number):
    return root / "evaluations" / f"v{version:06d}-e{number:06d}.json"


def reserve_confirmation(root, league, learner, champion, screening):
    """One saved seed range for these two weights in this league."""
    candidate, incumbent = model_reference(learner), model_reference(champion)
    key = f"{incumbent['weightsSHA256']}-{candidate['weightsSHA256']}"
    path = root / "confirmations" / f"{key}.json"
    scope = {
        "plan": CONFIRMATION_PLAN,
        "rulesID": league["rulesID"],
        "challengerSHA256": candidate["weightsSHA256"],
        "championSHA256": incumbent["weightsSHA256"],
    }
    if not path.exists():
        row = {
            **scope,
            "number": next_evaluation(root, league),
            "version": candidate["version"],
            "screening": screening,
        }
        atomic_json(path, row)
        return row, None
    row = json.loads(path.read_bytes())
    last = evaluation_offset(root) + league["evaluations"]
    if (
        set(row) != set(scope) | {"number", "version", "screening"}
        or any(row[key] != value for key, value in scope.items())
        or type(row["number"]) is not int
        or not evaluation_offset(root) <= row["number"] < last
        or type(row["version"]) is not int
        or row["version"] <= 0
        or (
            row["screening"] is not None
            and (type(row["screening"]) is not int or row["screening"] != row["number"] - 1)
        )
    ):
        raise ValueError(f"Invalid confirmation reservation: {path}")
    result_path = evaluation_file(root, row["version"], row["number"])
    if not result_path.exists():
        return row, None
    result = json.loads(result_path.read_bytes())
    if (
        result["format"] != "clash-arena-paired-eval-v4"
        or result["stage"] != "confirmation"
        or result["rulesID"] != scope["rulesID"]
        or result["generation"] != row["number"]
        or result["confirmationPlan"] != CONFIRMATION_PLAN
        or result["challenger"]
        != {"version": row["version"], "weightsSHA256": candidate["weightsSHA256"]}
        or result["champion"] != incumbent
    ):
        raise ValueError(f"Confirmation evidence does not match the reservation: {result_path}")
    if result["complete"] and result["openingAudit"]["complete"]:
        if (
            len(result["pairs"]) != CONFIRMATION_PLAN["pairs"]
            or len(result["games"]) != 2 * CONFIRMATION_PLAN["pairs"]
            or result["gate"]["alpha"] != CONFIRMATION_PLAN["alpha"]
            or (result["gate"]["passed"] and not result["openingAudit"]["passed"])
        ):
            raise ValueError(f"Incomplete confirmation evidence: {result_path}")
        if result["gate"]["passed"] and (
            result["gate"] != paired_gate(result["pairs"], alpha=CONFIRMATION_PLAN["alpha"])
            or not result["poolComparison"]["nonRegressing"]
            or any(row["score"] < 0.5 for row in result["matchupStrata"].values())
        ):
            raise ValueError(f"Invalid promotion gate in confirmation evidence: {result_path}")
        return row, result
    return row, None


def assess(
    control,
    workers,
    root,
    rules,
    learner,
    champion,
    frozen,
    pairs,
    *,
    number,
    plan=None,
    confirmation_of=None,
):
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
        alpha=plan["alpha"] if plan else None,
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
    if plan is not None:
        result["confirmationPlan"] = plan
    atomic_json(evaluation_file(root, learner.metadata["version"], number), result)
    return result


def promising(result):
    if not result["complete"] or not result["openingAudit"]["passed"]:
        return False
    gate = result["gate"]
    return (
        gate["reason"] == "screening_only"
        and gate["score"] >= MINIMUM_SCORE
        and result["poolComparison"]["nonRegressing"]
        and all(result["matchupStrata"][s]["score"] >= 0.5 for s in ("liveMirror", "mixedDeck"))
    )


def qualify(control, workers, root, league, rules, learner, pairs):
    """Screen an automatic candidate, or directly confirm a manually frozen candidate."""
    version = learner.metadata["version"]
    champion = Policy.load(checkpoint(root, league["champion"]), rules["id"])
    frozen = {
        "challenger": str(checkpoint(root, version)),
        "champion": str(checkpoint(root, league["champion"])),
        "rulesID": rules["id"],
    }
    screening = None
    result = None
    if pairs is not None:
        screening = next_evaluation(root, league)
        result = assess(
            control,
            workers,
            root,
            rules,
            learner,
            champion,
            frozen,
            max(pairs, 2 * len(POOL_DECKS)),
            number=screening,
        )
    confirmation = None
    if (result is None or promising(result)) and not control.stopped():
        reservation, confirmation = reserve_confirmation(root, league, learner, champion, screening)
        if confirmation is None:
            # Identical weights can be saved in more than one version. Resume the original
            # checkpoint and seed range so an interrupted run cannot get a different draw.
            reserved_learner = Policy.load(checkpoint(root, reservation["version"]), rules["id"])
            if reserved_learner.checksum() != learner.checksum():
                raise ValueError("The reserved confirmation checkpoint changed")
            control.report(
                {
                    "phase": "confirming",
                    "screeningEvaluation": reservation["screening"],
                    "confirmationPairs": CONFIRMATION_PLAN["pairs"],
                }
            )
            confirmation = assess(
                control,
                workers,
                root,
                rules,
                reserved_learner,
                champion,
                {**frozen, "challenger": str(checkpoint(root, reservation["version"]))},
                CONFIRMATION_PLAN["pairs"],
                number=reservation["number"],
                plan=CONFIRMATION_PLAN,
                confirmation_of=reservation["screening"],
            )
        if confirmation is not None:
            result = confirmation
    if confirmation is not None and confirmation["complete"] and confirmation["gate"]["passed"]:
        qualified_version = reservation["version"]
        league["champion"] = qualified_version
        if not any(row["version"] == qualified_version for row in league["opponents"]):
            league["opponents"] = (
                league["opponents"] + [{"version": qualified_version, "wins": 0, "games": 0}]
            )[-8:]
        store(root, league)
        publish_champion(root, league)
        if pairs is not None:
            # Ordinary training records an absolute progress curve against the fixed rule bots.
            qualified = Policy.load(checkpoint(root, qualified_version), rules["id"])
            measured = benchmark(qualified, rules["id"], report=control.report)
            atomic_json(root / "benchmarks" / f"v{qualified_version:06d}.json", measured)
            control.report({"benchmark": measured["opponents"]})
    if result is None:
        return None
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
    return result
