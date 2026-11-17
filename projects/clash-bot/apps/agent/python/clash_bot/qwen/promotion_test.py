import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.files import atomic_json
from clash_bot.qwen.promotion import publish
from clash_bot.qwen.promotion_fixture import fixture


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
            "changed_behavior",
            "changed_episode_behavior",
        )
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                worker, checkpoint, path, report = fixture(directory, tied=case == "tied")
                current = worker.directory / "current.json"
                original = current.read_bytes()
                meta_path = checkpoint / "metadata.json"
                metadata = json.loads(meta_path.read_text())
                if case == "changed_behavior":
                    report["behaviorSHA256"] = "b" * 64
                if case == "changed_episode_behavior":
                    atomic_json(
                        Path(report["games"][0]["directory"]) / "qualification.json",
                        {"role": "heldout_evaluation", "behaviorSHA256": "b" * 64},
                    )
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


if __name__ == "__main__":
    unittest.main()
