import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.qwen.search_data import load_search_targets


class SearchDataTest(unittest.TestCase):
    def test_conservation_labels_reject_dominated_targets_and_impossible_mana_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            path, original = self.write(directory)
            row = {
                **original["samples"][0],
                "controllerVersion": 3,
                "target": [1, 0, 0],
                "evidence": {
                    "kind": "paired_elixir_conservation_rollout",
                    "actionOrder": "seeded_permutation",
                    "horizonTicks": 240,
                    "futureEnemyDeployments": 0,
                    "towerImprovement": [0, 0, 0],
                    "bestImprovement": 0,
                    "elixirCosts": [0, 2, 4],
                    "retainedElixirMilli": [8000, 6000, 4000],
                    "baselineElixirMilli": 8000,
                },
            }
            data = {
                **original,
                "format": "counterpush-tactical-targets-v3",
                "source": "local_native_counterfactual_v2",
                "controllerVersion": 3,
                "split": "train",
                "trainingEpochs": 3,
                "samples": [row],
            }
            path.write_text(json.dumps(data))
            self.assertEqual(load_search_targets(path)[0], data)
            for change in (
                {"target": [0, 1, 0]},
                {"evidence": {**row["evidence"], "elixirCosts": [0, 2]}},
                {"evidence": {**row["evidence"], "elixirCosts": [0, -2, 4]}},
                {"evidence": {**row["evidence"], "elixirCosts": [0, 0, 0]}},
                {"evidence": {**row["evidence"], "retainedElixirMilli": [8000, 6000]}},
                {"evidence": {**row["evidence"], "retainedElixirMilli": [6000, 6000, 4000]}},
                {"evidence": {**row["evidence"], "retainedElixirMilli": [8000, 10001, 4000]}},
            ):
                path.write_text(json.dumps({**data, "samples": [{**row, **change}]}))
                with self.assertRaises(ValueError):
                    load_search_targets(path)

    def test_tactical_targets_require_measured_gains_and_reject_heldout_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path, data = self.write(directory)
            row = {
                **data["samples"][0],
                "controllerVersion": 3,
                "target": [0, 1, 0],
                "evidence": {
                    "kind": "paired_passive_future_rollout",
                    "actionOrder": "seeded_permutation",
                    "horizonTicks": 240,
                    "futureEnemyDeployments": 0,
                    "towerImprovement": [0, 200, 80],
                    "bestImprovement": 200,
                },
            }
            data = {
                **data,
                "format": "counterpush-tactical-targets-v3",
                "source": "local_native_counterfactual_v2",
                "controllerVersion": 3,
                "split": "train",
                "trainingEpochs": 3,
                "samples": [row],
            }
            path.write_text(json.dumps(data))
            self.assertEqual(load_search_targets(path)[0], data)
            for changed in (
                {"split": "holdout"},
                {"trainingEpochs": 20},
                {"samples": [{**row, "target": [0, 0, 1]}]},
                {
                    "samples": [
                        {**row, "evidence": {**row["evidence"], "futureEnemyDeployments": 1}}
                    ]
                },
            ):
                path.write_text(json.dumps({**data, **changed}))
                with self.assertRaises(ValueError):
                    load_search_targets(path)

    def write(self, directory):
        root = Path(directory)
        image = root / "before.png"
        image.write_bytes(b"public before image")
        row = {
            "id": "game-1-t100",
            "image": image.name,
            "imageSHA256": hashlib.sha256(image.read_bytes()).hexdigest(),
            "rulesID": "rules-a",
            "terminalOutcome": 1,
            "choices": [0, 1, 2],
            "target": [0.1, 0.8, 0.1],
            "search": {"source": "public_history_information_set_puct", "simulations": 16},
            "prompt": "A B C",
        }
        data = {
            "format": "clash-arena-qwen-search-v1",
            "rulesID": "rules-a",
            "samples": [row],
            "source": "local_native_selfplay_public_before_state",
            "teacherQualifiedForRealGame": False,
        }
        path = root / "dataset.json"
        path.write_text(json.dumps(data))
        return path, data

    def test_validates_before_image_rule_terminal_and_normalized_search_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            path, data = self.write(directory)
            self.assertEqual(load_search_targets(path)[0], data)
            for replacement in (
                {"target": [0.1, 0.9, 0.9]},
                {"terminalOutcome": None},
                {"rulesID": "rules-b"},
                {"target": [float("nan"), 0, 0]},
                {"image": "../before.png"},
            ):
                invalid = {**data, "samples": [{**data["samples"][0], **replacement}]}
                path.write_text(json.dumps(invalid))
                with self.assertRaises((ValueError, FileNotFoundError)):
                    load_search_targets(path)
            path.write_text(json.dumps(data))
            (path.parent / "before.png").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "changed"):
                load_search_targets(path)


if __name__ == "__main__":
    unittest.main()
