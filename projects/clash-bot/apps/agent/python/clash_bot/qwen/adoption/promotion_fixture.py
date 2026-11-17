"""Test fixture: a frozen champion, a trained private candidate and raw A/B evidence."""

import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import mlx.core as mx

from clash_bot.files import atomic_json
from clash_bot.qwen.learning.learner import Learner
from clash_bot.qwen.learning.learning_policy import FinalMLPLoRA
from clash_bot.qwen.worker.runtime import LearningWorker


def fixture(directory, tied=False, wins=16):
    mx.random.seed(7)
    data = Path(directory) / "data"
    root = data / "qwen/learning"
    learner = Learner(
        FinalMLPLoRA(12, 8),
        mx.ones(8),
        1e-6,
        mx.random.normal((3, 8)),
        root,
        "test-model",
        "test.layer",
    )
    sample = {
        "features": mx.ones(12),
        "base": mx.arange(8).astype(mx.float32),
        "labels": [0, 1, 2],
        "version": 0,
        "chosen": 1,
        "remaining": 0,
        "policy_bias": mx.zeros(3),
    }
    sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
    learner.train([sample], 1, "bootstrap")
    # The fixture bypasses LearningWorker.__init__, which freezes the deployed champion.
    learner.frozen = True
    private = data / "arena/qwen/training/private"
    source = root / "checkpoints/v000001"
    shutil.copytree(source, private / "checkpoints/v000001")
    atomic_json(private / "current.json", json.loads((root / "current.json").read_text()))
    candidate = Learner(
        FinalMLPLoRA(12, 8),
        learner.norm_weight,
        learner.norm_eps,
        learner.token_rows,
        private,
        "test-model",
        "test.layer",
    )
    candidate.metadata["candidate_parent_sha256"] = learner.metadata["weights_sha256"]
    supervised = {**sample, "version": 1, "search_target": [0.0, 1.0, 0.0]}
    supervised["old_log_probs"] = mx.stop_gradient(candidate.log_probs(supervised))
    if not candidate.distill_search([supervised], "native-search-targets", "rules-a")["updated"]:
        raise AssertionError("Fixture gradient did not update the private candidate")
    checkpoint = private / "checkpoints/v000002"
    report_path = data / "counterpush/control/evaluations/trial.json"
    games = []
    for pair in range(16):
        order = ("baseline", "candidate") if pair % 2 == 0 else ("candidate", "baseline")
        for variant in order:
            meta = candidate.metadata if variant == "candidate" else learner.metadata
            win = variant == "candidate" and not tied and pair < wins
            blue, red = (3, 0) if win else (0, 3)
            episode = data / "counterpush/runs" / f"pair-{pair}-{variant}"
            episode.mkdir(parents=True)
            atomic_json(
                episode / "qualification.json",
                {"role": "heldout_evaluation", "behaviorSHA256": "a" * 64},
            )
            rows = [
                {
                    "type": "match_start",
                    "source": "counterpush_visible_browser",
                    "initialPhase": "result",
                    "controllerVersion": 1,
                },
                {
                    "type": "prediction",
                    "behavior": {
                        "adapter_sha256": meta["weights_sha256"],
                        "model_identity": meta["model_sha256"],
                        "trainable": False,
                        "read_only_evaluation": True,
                        "selection": "categorical_as_live",
                        "controller_version": 1,
                    },
                },
                {
                    "type": "result",
                    "source": "counterpush_result_dom_verified2",
                    "blue": blue,
                    "red": red,
                    "readings": [f"Crowns: you {blue}, the opponent {red}"] * 2,
                },
            ]
            (episode / "events.jsonl").write_text("\n".join(json.dumps(row) for row in rows))
            games.append(
                {
                    "directory": str(episode),
                    "variant": variant,
                    "pair": pair,
                    "weightsSHA256": meta["weights_sha256"],
                    "result": "win" if win else "loss",
                    "score": int(win),
                }
            )
    pair_scores = [0.5 + 0.5 * (not tied and pair < wins) for pair in range(16)]
    mean = sum(pair_scores) / 16
    report = {
        "format": "counterpush-frozen-ab-evaluation-v2",
        "complete": True,
        "behaviorSHA256": "a" * 64,
        "requestedPairs": 16,
        "minimumPairs": 16,
        "trainingDuringEvaluation": False,
        "selection": "categorical_as_live",
        "baselineUnchanged": True,
        "order": "AB_BA_blocks",
        "baseline": learner.metadata,
        "candidate": candidate.metadata,
        "games": games,
        "pairs": pair_scores,
        "gate": {"passed": True, "score": mean, "alpha": 0.025},
        "method": "paired_exact_wins_v1",
        "trialID": "reserved-trial",
        "alphaSpendingAttempt": 0,
    }
    atomic_json(report_path, report)
    atomic_json(
        data / "counterpush/control/evaluation-attempts.json",
        {
            "count": 1,
            "trials": {
                "reserved-trial": {
                    "index": 0,
                    "behaviorSHA256": "a" * 64,
                    "file": str(report_path),
                    "baselineSHA256": learner.metadata["weights_sha256"],
                    "candidateSHA256": candidate.metadata["weights_sha256"],
                    "method": "paired_exact_wins_v1",
                    "minimumPairs": 16,
                    "requestedPairs": 16,
                }
            },
        },
    )
    worker = object.__new__(LearningWorker)
    worker.directory, worker.learner, worker.champion_learner, worker.evaluation_backup = (
        root,
        learner,
        learner,
        None,
    )
    worker.spec = {
        "input_size": 12,
        "hidden_size": 8,
        "identity": learner.metadata["model_sha256"],
        "name": "fixture",
    }
    worker.model = SimpleNamespace(
        language_model=SimpleNamespace(
            model=SimpleNamespace(norm=SimpleNamespace(adapter=learner.adapter))
        )
    )
    return worker, checkpoint, report_path, report
