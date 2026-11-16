import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.qwen.decision_input import CONTRACT, mirror_actor_prompt
from clash_bot.qwen.opponent_data import DEMONSTRATION_FORMAT, load_demonstrations


class OpponentDataTest(unittest.TestCase):
    def fixture(self, directory, **overrides):
        directory = Path(directory)
        (directory / "images").mkdir(exist_ok=True)
        (directory / "images/before.png").write_bytes(b"before")
        (directory / "images/after.png").write_bytes(b"after")
        sample = {
            "id": "furnace",
            "actor": "red_top",
            "verified_actor": True,
            "absent_before": True,
            "confidence": 0.95,
            "hand": None,
            "elixir": None,
            "exact_target": None,
            "evidence": "new_unit_visible",
            "before_at": 1000,
            "after_at": 4000,
            "situation": {
                "at": 1000,
                "own": {"units": [], "recentPlays": []},
                "opponent": {"units": [], "elixir": {"min": 4, "max": 6}},
            },
            "river_y": 276,
            "label_kind": "card_lane",
            "target_region": None,
            "image": "images/before.png",
            "image_sha256": hashlib.sha256(b"before").hexdigest(),
            "source_before_sha256": hashlib.sha256(b"original-before").hexdigest(),
            "evidence_image": "images/after.png",
            "evidence_sha256": hashlib.sha256(b"after").hexdigest(),
            "choices": [0, 1],
            "target_ids": [1],
            "card": "furnace",
            "lane": "left",
            "candidates": [
                {"id": 0, "card": None, "cost": 0, "target": {"x": 0, "y": 0}},
                {"id": 1, "card": "furnace", "cost": 4, "target": {"x": 95, "y": 350}},
            ],
            **overrides,
        }
        sample["prompt"] = (
            mirror_actor_prompt(sample) if isinstance(sample["situation"], dict) else "invalid"
        )
        path = directory / "dataset.json"
        path.write_text(
            json.dumps(
                {
                    "format": DEMONSTRATION_FORMAT,
                    "source": "counterpush_live_screen",
                    "deck": [name for name, code in CONTRACT["codes"].items() if code.isupper()],
                    "teacher_result": {
                        "type": "result",
                        "source": "counterpush_result_dom_verified2",
                        "blue": 0,
                        "red": 3,
                        "readings": ["Crowns: you 0, the opponent 3"] * 2,
                    },
                    "samples": [sample],
                }
            )
        )
        return path

    def test_defensive_poison_position_does_not_supervise_every_same_lane_choice(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.fixture(
                directory,
                card="poison",
                river_y=294,
                label_kind="placement_region",
                target_region={"x": 95, "y": 424, "radius": 24},
                grounding={"x": 95, "y": 164, "box": [70, 139, 120, 189]},
                choices=[0, 1, 2],
                target_ids=[1],
                candidates=[
                    {"id": 0, "card": None, "cost": 0, "target": {"x": 0, "y": 0}},
                    {"id": 1, "card": "poison", "cost": 4, "target": {"x": 95, "y": 424}},
                    {"id": 2, "card": "poison", "cost": 4, "target": {"x": 95, "y": 164}},
                ],
            )
            load_demonstrations(path)
            original = json.loads(path.read_text())
            changed = json.loads(path.read_text())
            changed["samples"][0]["target_ids"] = [1, 2]
            path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "placement region"):
                load_demonstrations(path)
            changed = json.loads(json.dumps(original))
            changed["samples"][0]["target_region"]["y"] = 164
            path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "observed stationary"):
                load_demonstrations(path)
            changed = json.loads(json.dumps(original))
            changed["teacher_result"] = {
                "type": "result",
                "source": "counterpush_result_dom_verified2",
                "blue": 3,
                "red": 0,
                "readings": ["Crowns: you 3, the opponent 0"] * 2,
            }
            path.write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "verified winner"):
                load_demonstrations(path)
            original["format"] = "counterpush-card-lane-demonstrations-v2"
            path.write_text(json.dumps(original))
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                load_demonstrations(path)

    def test_validates_evidence_hashes_and_rejects_changed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.fixture(directory)
            dataset, identity, _ = load_demonstrations(path)
            self.assertEqual(len(dataset["samples"]), 1)
            self.assertEqual(len(identity), 64)
            (Path(directory) / "images/after.png").write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"):
                load_demonstrations(path)

    def test_quarantine_also_blocks_an_already_prepared_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            source_hash = hashlib.sha256(b"original-before").hexdigest()
            path = self.fixture(directory)
            quarantine = Path(directory) / "quarantine.json"
            quarantine.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "entries": [
                            {
                                "card": "furnace",
                                "before_sha256": source_hash,
                                "reason": "already_present",
                            }
                        ],
                    }
                )
            )
            load_demonstrations(path)
            with self.assertRaisesRegex(ValueError, "Quarantined demonstration"):
                load_demonstrations(path, quarantine)

    def test_rejects_hidden_state_guesses_wrong_actor_and_label_mismatches(self):
        with tempfile.TemporaryDirectory() as directory:
            for overrides in (
                {"elixir": 8},
                {"verified_actor": False},
                {"target_ids": [0]},
                {"confidence": 0.8},
                {"after_at": 20000},
                {"situation": None},
                {"image": "../outside.png"},
            ):
                with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                    load_demonstrations(self.fixture(directory, **overrides))


if __name__ == "__main__":
    unittest.main()
