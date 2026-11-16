import json
import shutil
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import mlx.core as mx

from clash_bot.files import atomic_json
from clash_bot.qwen.learning_policy import FinalMLPLoRA, Learner, weights_digest
from clash_bot.qwen.promotion import publish
from clash_bot.qwen.runtime import LearningWorker


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
    }
    sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
    learner.train([sample], 1, "bootstrap")
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
        "format": "counterpush-frozen-ab-evaluation-v1",
        "complete": True,
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


class QualifiedPromotionTest(unittest.TestCase):
    def test_raw_games_cannot_claim_another_decision_controller(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, report = fixture(directory)
            game = Path(report["games"][0]["directory"]) / "events.jsonl"
            rows = [json.loads(line) for line in game.read_text().splitlines()]
            rows[0]["controllerVersion"] = 3
            game.write_text("\n".join(json.dumps(row) for row in rows))
            with self.assertRaisesRegex(ValueError, "controller"):
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})

    def test_exact_win_assessment_is_recomputed_and_an_unregistered_method_is_rejected(self):
        for wins in (5, 6):
            with self.subTest(wins=wins), tempfile.TemporaryDirectory() as directory:
                worker, checkpoint, path, _ = fixture(directory, wins=wins)
                original = (worker.directory / "current.json").read_bytes()
                if wins == 6:
                    self.assertTrue(
                        worker.promote({"checkpoint": str(checkpoint), "report": str(path)})[
                            "promoted"
                        ]
                    )
                else:
                    with self.assertRaisesRegex(ValueError, "improvement"):
                        worker.promote({"checkpoint": str(checkpoint), "report": str(path)})
                    self.assertEqual((worker.directory / "current.json").read_bytes(), original)
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, report = fixture(directory)
            report["method"] = "hoeffding_score"
            atomic_json(path, report)
            with self.assertRaisesRegex(ValueError, "Unknown qualification method"):
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})

    def test_full_raw_evidence_publishes_once_reloads_and_keeps_the_previous_champion(self):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, report = fixture(directory)
            previous = weights_digest(worker.learner.adapter)
            old_file = worker.directory / "checkpoints/v000001/adapter.safetensors"
            old_bytes = old_file.read_bytes()
            result = worker.promote({"checkpoint": str(checkpoint), "report": str(path)})
            self.assertTrue(result["promoted"])
            self.assertEqual(
                worker.status()["weights_sha256"], report["candidate"]["weights_sha256"]
            )
            self.assertNotEqual(worker.status()["weights_sha256"], previous)
            self.assertEqual(old_file.read_bytes(), old_bytes)
            self.assertEqual(worker.status()["role"], "champion")
            self.assertEqual(
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})["reason"],
                "already_applied",
            )
            root = worker.directory.parents[1] / "arena/qwen/training/next"
            private = worker.begin_candidate(str(root))
            self.assertEqual(
                private["candidate_parent_sha256"], report["candidate"]["weights_sha256"]
            )
            self.assertEqual(
                worker.end_candidate()["weights_sha256"], report["candidate"]["weights_sha256"]
            )

    def test_missing_or_forged_qualification_never_moves_the_deployed_pointer(self):
        cases = (
            "partial",
            "tied",
            "wrong_parent",
            "changed_score",
            "trainable",
            "leaked",
            "wrong_alpha",
            "unreserved",
            "duplicate",
            "resumed_match",
        )
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                worker, checkpoint, path, report = fixture(directory, tied=case == "tied")
                current = worker.directory / "current.json"
                original = current.read_bytes()
                meta_path = checkpoint / "metadata.json"
                metadata = json.loads(meta_path.read_text())
                if case == "partial":
                    report["complete"] = False
                if case == "wrong_parent":
                    metadata["candidate_parent_sha256"] = "stale"
                if case == "changed_score":
                    report["games"][0]["result"] = "win"
                if case == "leaked":
                    metadata["episodes"].append(report["games"][0]["directory"])
                if case == "wrong_alpha":
                    report["gate"]["alpha"] = 0.05
                if case == "unreserved":
                    report["trialID"] = "not-reserved"
                if case == "duplicate":
                    report["games"][1]["directory"] = report["games"][0]["directory"]
                if case in ("trainable", "resumed_match"):
                    event_file = Path(report["games"][0]["directory"]) / "events.jsonl"
                    rows = [json.loads(line) for line in event_file.read_text().splitlines()]
                    if case == "trainable":
                        rows[1]["behavior"]["trainable"] = True
                    else:
                        rows[0]["initialPhase"] = "battle"
                    event_file.write_text("\n".join(json.dumps(row) for row in rows))
                atomic_json(meta_path, metadata)
                atomic_json(path, report)
                with self.assertRaises(ValueError):
                    publish(worker.directory, checkpoint, path, metadata["weights_sha256"])
                self.assertEqual(current.read_bytes(), original)

    def test_direct_training_of_a_guarded_champion_rolls_back_and_a_private_candidate_can_train(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            worker, checkpoint, path, _ = fixture(directory)
            learner = worker.learner
            sample = {
                "features": mx.ones(12),
                "base": mx.arange(8).astype(mx.float32),
                "labels": [0, 1, 2],
                "version": learner.metadata["version"],
                "chosen": 1,
                "remaining": 0,
            }
            sample["old_log_probs"] = mx.stop_gradient(learner.log_probs(sample))
            original = weights_digest(learner.adapter)
            with self.assertRaisesRegex(ValueError, "frozen"):
                learner.train([sample], 1, "unqualified-update")
            self.assertEqual(weights_digest(learner.adapter), original)
            worker.begin_candidate(str(checkpoint.parents[1]))
            with self.assertRaisesRegex(ValueError, "Restore"):
                worker.promote({"checkpoint": str(checkpoint), "report": str(path)})
            self.assertEqual(worker.end_candidate()["weights_sha256"], original)


if __name__ == "__main__":
    unittest.main()
