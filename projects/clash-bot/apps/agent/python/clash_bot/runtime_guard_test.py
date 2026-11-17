import fcntl
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from clash_bot import runtime_guard

# A pid that cannot belong to a running process.
DEAD_PID = 2_147_483_646


class RuntimeGuardTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.data = Path(directory.name)
        patcher = mock.patch.object(runtime_guard, "DATA_DIR", self.data)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_learning_lock(self, text):
        path = self.data / "qwen/selfplay/lock.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def test_refuses_setup_while_a_learner_holds_the_lock(self):
        self.write_learning_lock(json.dumps({"pid": os.getpid(), "id": "live"}))
        with self.assertRaises(SystemExit):
            runtime_guard.refuse_while_running("준비")

    def test_allows_setup_after_a_crash_left_an_empty_or_dead_lock(self):
        for text in ("", json.dumps({"pid": DEAD_PID, "id": "crashed"})):
            with self.subTest(text=text):
                self.write_learning_lock(text)
                runtime_guard.refuse_while_running("준비")

    def test_refuses_setup_while_self_play_holds_its_file_lock(self):
        path = self.data / "arena/control/lock.json"
        path.parent.mkdir(parents=True)
        with path.open("a+") as held:
            fcntl.flock(held.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(SystemExit):
                runtime_guard.refuse_while_running("준비")
        runtime_guard.refuse_while_running("준비")


if __name__ == "__main__":
    unittest.main()
