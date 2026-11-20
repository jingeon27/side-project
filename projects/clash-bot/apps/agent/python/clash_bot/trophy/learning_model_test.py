import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

import numpy as np

from clash_bot.arena.policy.features import (
    ACTION_SIZE,
    CATALOGUE,
    WEIGHT_SHAPES,
    checksum,
    exported,
    forward,
)
from clash_bot.trophy.learner import load_weights, prepare_rows
from clash_bot.trophy.protocol import Episode, probabilities
from clash_bot.trophy.protocol_test import episode, transition
from clash_bot.trophy.worker import Import, Initialize, Train, Worker


@unittest.skipUnless(
    os.environ.get("RUN_TROPHY_MODEL_INTEGRATION") == "1", "explicit CPU MLX gradient integration"
)
class RealOwnPolicyTrainingTest(unittest.TestCase):
    def test_real_gradient_evidence_exclusion_and_idempotent_checkpoint(self):
        rng = np.random.default_rng(13)
        weights = {
            name: (
                rng.normal(0, 0.02, shape) if name.endswith("weight") else np.ones(shape) * 0.01
            ).astype(np.float32)
            for name, shape in WEIGHT_SHAPES.items()
        }
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            seed = root / "seed-policy.json"
            seed.write_text(
                json.dumps(exported(weights, {"version": 8, "catalogue": CATALOGUE.id}))
            )
            worker = Worker(root / "owned")
            snapshot = worker.handle(
                Initialize(op="initialize", seed=str(seed), behaviorSHA256="b" * 64)
            )
            paths = []
            for index in range(2):
                folder = worker.root / "runs" / str(index)
                folder.mkdir(parents=True)
                image = folder / "0001.png"
                image.write_bytes(b"unit-test-image-evidence")
                digest = hashlib.sha256(image.read_bytes()).hexdigest()
                data = episode()
                data.update(id=f"00000000-0000-4000-8000-{index:012}", policy=snapshot)
                rows = []
                for i in range(8):
                    row = transition()
                    row["at"] += i
                    row["imageSHA256"] = digest
                    row["features"] = {"index": [1, 14], "value": [0.7, 1.0]}
                    acts = np.zeros((2, ACTION_SIZE), np.float32)
                    acts[0, 8] = 1
                    acts[1, 0] = 1
                    acts[1, 10] = 0.2
                    row["actionFeatures"] = acts.tolist()
                    state = (
                        Episode.model_validate(
                            {**data, "transitions": [{**row, "at": 1000.0 + j} for j in range(8)]}
                        )
                        .transitions[0]
                        .features.dense()
                    )
                    logits, _, value = forward(weights, state, acts)
                    row["value"] = value
                    row["probabilities"] = probabilities(logits, row["bias"], 1, 0.01).tolist()
                    rows.append(row)
                data["transitions"] = rows
                data["resultEvidence"] = [
                    {"image": "result-1.png", "sha256": digest, "at": 2000.0},
                    {"image": "result-2.png", "sha256": digest, "at": 2500.0},
                ]
                for name in ("result-1.png", "result-2.png"):
                    (folder / name).write_bytes(image.read_bytes())
                path = folder / "trajectory.json"
                path.write_text(json.dumps(data))
                paths.append(str(path))
            request = Train(
                op="train",
                policy=snapshot,
                episodes=paths,
                behaviorSHA256="b" * 64,
                championParentSHA256=snapshot["weightsSHA256"],
            )
            before = checksum(load_weights(snapshot["checkpoint"]))
            report = worker.handle(request)
            self.assertTrue(report["report"]["updated"])
            self.assertNotEqual(before, report["snapshot"]["weightsSHA256"])
            self.assertEqual(report["report"]["samples"], 16)
            self.assertLessEqual(report["report"]["maximumKL"], 0.02)
            sample = Episode.model_validate_json(Path(paths[0]).read_text()).transitions[0]
            updated_logits, _, _ = forward(
                load_weights(report["snapshot"]["checkpoint"]),
                sample.features.dense(),
                np.asarray(sample.actionFeatures, np.float32),
            )
            updated_probabilities = probabilities(
                updated_logits, sample.bias, sample.temperature, sample.exploration
            )
            self.assertLess(
                updated_probabilities[sample.chosen], sample.probabilities[sample.chosen]
            )
            self.assertEqual(worker.handle(request), report)
            receipt = worker.root / "updates" / f"{report['id']}.json"
            receipt.unlink()
            self.assertEqual(worker.handle(request), report)
            self.assertEqual(checksum(load_weights(snapshot["checkpoint"])), before)
            invalid = Episode.model_validate_json(Path(paths[0]).read_text())
            invalid.transitions[0].probabilities = [0.9, 0.1]
            with self.assertRaisesRegex(ValueError, "behavior"):
                prepare_rows(weights, [invalid], "b" * 64)
            Path(paths[0]).write_text(
                json.dumps(
                    {
                        **json.loads(Path(paths[0]).read_text()),
                        "role": "candidate",
                        "learningEligible": False,
                    }
                )
            )
            with self.assertRaises(ValueError):
                worker.handle(request)

    def test_simulator_champion_import_is_immutable_and_outside_ppo_versions(self):
        weights = {name: np.full(shape, 0.02, np.float32) for name, shape in WEIGHT_SHAPES.items()}
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            policy = root / "champion-policy.json"
            policy.write_text(
                json.dumps(exported(weights, {"version": 3, "catalogue": CATALOGUE.id}))
            )
            worker = Worker(root / "owned")
            request = Import(
                op="import",
                policy=str(policy),
                version=5,
                behaviorSHA256="b" * 64,
                championSHA256="c" * 64,
            )
            snapshot = worker.handle(request)
            self.assertEqual(snapshot["weightsSHA256"], checksum(weights))
            self.assertEqual(Path(snapshot["checkpoint"]).parent.parent.name, "imports")
            self.assertFalse((worker.root / "checkpoints").exists())
            metadata = json.loads(
                (Path(snapshot["checkpoint"]).parent / "metadata.json").read_text()
            )
            self.assertEqual(metadata["source"], "simulator_self_play_champion")
            self.assertEqual(metadata["championParentSHA256"], "c" * 64)
            # The same weights resume to the stored snapshot even with another version number.
            again = worker.handle(request.model_copy(update={"version": 9}))
            self.assertEqual(again, snapshot)
            with self.assertRaises(ValueError):
                worker.handle(request.model_copy(update={"behaviorSHA256": "d" * 64}))
            self.assertEqual(
                checksum(load_weights(snapshot["checkpoint"])), snapshot["weightsSHA256"]
            )


if __name__ == "__main__":
    unittest.main()
