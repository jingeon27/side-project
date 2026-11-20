import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from pydantic import ValidationError

from clash_bot.perception.labels.capture import seal_stream, stream_frame
from clash_bot.perception.labels.schema import Label
from clash_bot.perception.labels.store import (
    add_frame,
    database,
    digest,
    import_run,
    labeled,
    partition,
    queue,
    save_label,
)
from clash_bot.perception.labels.workbench import daily

TRAIN = "7bd94838-33c3-46a9-81ab-29fcfc619d75"
TEST = "124280af-e335-4792-9567-ea2dfa8e1da2"


class StoreTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.run = self.root / TRAIN
        self.run.mkdir()

    def frame(self, color=(20, 30, 40), name="001.png"):
        output = io.BytesIO()
        Image.new("RGB", (368, 652), color).save(output, format="PNG")
        body = output.getvalue()
        (self.run / name).write_bytes(body)
        return digest(body)

    def test_unique_pixels_match_roles_and_revisions(self):
        sha = self.frame()

        def insert(db, match, role):
            return add_frame(db, match, role, self.run, "001.png", sha, 10)

        with database(self.root / "db") as db:
            self.assertTrue(insert(db, TRAIN, "training"))
            self.assertFalse(insert(db, TRAIN, "training"))
            self.assertFalse(insert(db, TEST, "candidate"))
            with self.assertRaisesRegex(ValueError, "role"):
                insert(db, TRAIN, "baseline")
        label = Label(frameSHA256=sha, reviewer="visual_assistant", elixir=0)
        with database(self.root / "db") as db:
            self.assertEqual(save_label(db, label, 0), 1)
        with database(self.root / "db") as db:
            with self.assertRaisesRegex(ValueError, "changed"):
                save_label(db, label, 0)
        with database(self.root / "db") as db:
            self.assertEqual(save_label(db, label.model_copy(update={"reviewer": "human"}), 1), 2)
        with database(self.root / "db") as db:
            with self.assertRaisesRegex(ValueError, "human"):
                save_label(db, label, 2)
            self.assertEqual(next(iter(labeled(db)))["split"], "coverage")
            self.assertFalse(queue(db, "measurement"))

    def test_rejected_frames_and_readonly_roles(self):
        sha = self.frame()
        with database(self.root / "db") as db:
            for path, expected in [("../001.png", sha), ("001.png", "1" * 64)]:
                with self.assertRaises(ValueError):
                    add_frame(db, TRAIN, "training", self.run, path, expected, 12)
            for role in ("baseline", "candidate"):
                self.assertEqual(partition(TRAIN, role), "measurement")
            record = {
                "format": "trophy-own-trajectory-v1",
                "id": TRAIN,
                "role": "training",
                "learningEligible": False,
            }
            (self.run / "trajectory.json").write_text(json.dumps(record))
            self.assertEqual(import_run(db, self.run), 0)
        with self.assertRaises(ValidationError):
            Label(
                frameSHA256=sha, reviewer="human", objects=[{"kind": "knight", "x": 370, "y": 40}]
            )

    def test_stream_seal_retains_an_unconfirmed_and_empty_detection_frame(self):
        sha = self.frame()
        plan = {"directory": str(self.run), "id": TRAIN, "behaviorSHA256": "1" * 64}
        item = {
            "sequence": 1,
            "image": "001.png",
            "imageSHA256": sha,
            "at": 10,
            "raw": {"units": []},
        }
        stream_frame(plan, item)
        stream_frame(plan, item)
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            seal_stream(plan, 2)
        seal_stream(plan, 1)
        with self.assertRaisesRegex(ValueError, "sealed"):
            stream_frame(plan, {**item, "sequence": 2})
        record = {
            **plan,
            "format": "trophy-own-trajectory-v1",
            "role": "training",
            "learningEligible": True,
            "transitions": [],
        }
        (self.run / "trajectory.json").write_text(json.dumps(record))
        with database(self.root / "db") as db:
            self.assertEqual(import_run(db, self.run), 1)
            self.assertEqual(db.execute("SELECT total,uniqueFrames FROM streams").fetchone()[0], 1)
            self.assertEqual(
                json.loads(db.execute("SELECT raw FROM frames").fetchone()[0]), item["raw"]
            )

    def test_daily_measurement_cap_and_blind_payload(self):
        for i in range(12):
            with database(self.root / "db") as db:
                name = f"{i}.png"
                add_frame(
                    db,
                    TEST,
                    "baseline",
                    self.run,
                    name,
                    self.frame((i, 0, 0), name),
                    i,
                    {"units": [{"confidence": i / 12}]},
                    "1" * 64,
                )
        with database(self.root / "db") as db:
            rows = daily(db, "measurement")
            self.assertEqual(len(rows), 10)
            self.assertEqual(set(rows[0]), {"sha", "match", "name", "at", "revision"})
        with database(self.root / "db") as db:
            save_label(db, Label(frameSHA256=rows[0]["sha"], reviewer="human"), 0)
        with database(self.root / "db") as db:
            self.assertEqual(len(daily(db, "measurement")), 9)
