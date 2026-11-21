"""A run owns its data directory alone, stops on request and leaves its outcome in the status."""

import json
import os
import signal
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from clash_bot.arena.league.control import Control
from clash_bot.arena.league.status import format_status, read_status, request_stop


class ControlTest(unittest.TestCase):
    def status(self, directory):
        return json.loads((Path(directory) / "arena/control/status.json").read_text())

    def test_status_cli_needs_no_site_packages_and_does_not_create_a_control_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            command = [sys.executable, "-S", "-m", "clash_bot.arena.cli", "status"]
            env = {**os.environ, "CLASH_BOT_DATA_DIR": directory}
            self.assertEqual(
                json.loads(subprocess.check_output(command, env=env)),
                {"phase": "not_started", "running": False},
            )
            self.assertIn(
                "시작 전", subprocess.check_output([*command, "--summary"], env=env, text=True)
            )
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_status_reads_live_and_stale_processes_and_addresses_only_the_live_run(self):
        with tempfile.TemporaryDirectory() as directory:
            with Control(directory, hours=0) as control:
                control.report({"phase": "selfplay", "learner": 3, "champion": 0})
                with patch("clash_bot.arena.league.status.os.kill", side_effect=ProcessLookupError):
                    stale = read_status(control.directory)
                    self.assertIn("프로세스 종료", format_status(stale))
                    self.assertFalse(request_stop(control.directory)["stopRequested"])
                    self.assertFalse(control.stopped())
                self.assertTrue(read_status(control.directory)["running"])
                self.assertTrue(request_stop(control.directory)["stopRequested"])
                self.assertTrue(control.stopped())
            self.assertIn("중지됨", format_status(read_status(control.directory)))

    def test_summary_identifies_the_evaluated_candidate_even_when_learning_has_advanced(self):
        state = {
            "phase": "stopped",
            "running": False,
            "learner": 4,
            "champion": 0,
            "evaluation": {
                "complete": True,
                "challenger": {"version": 2},
                "champion": {"version": 0},
                "gate": {"passed": False, "pairs": 64, "score": 0.4375},
            },
        }
        summary = format_status(state)
        self.assertIn("학습 v4", summary)
        self.assertIn("v2 대 v0 · 64쌍 · 득점률 43.8%", summary)
        self.assertNotIn("마지막 평가", format_status({**state, "evaluation": {"complete": True}}))

    def test_a_second_run_is_refused_until_the_first_leaves(self):
        with tempfile.TemporaryDirectory() as directory:
            with Control(directory, hours=0):
                with self.assertRaisesRegex(RuntimeError, "already running"):
                    Control(directory, hours=0).__enter__()
            with Control(directory, hours=0) as control:
                control.report({"phase": "selfplay"})
            self.assertEqual(self.status(directory)["phase"], "stopped")

    def test_only_a_stop_request_for_this_run_or_its_time_limit_stops_it(self):
        with tempfile.TemporaryDirectory() as directory:
            stop = Path(directory) / "arena/control/stop.json"
            with Control(directory, hours=0) as control:
                self.assertFalse(control.stopped())
                stop.write_text(json.dumps({"id": "another-run"}))
                self.assertFalse(control.stopped())
                stop.write_text(json.dumps({"id": control.owner["id"]}))
                self.assertTrue(control.stopped())
            with Control(directory, hours=1e-9) as control:
                # The earlier run's request names its id, not this one's.
                self.assertNotEqual(json.loads(stop.read_text())["id"], control.owner["id"])
                self.assertTrue(control.stopped())

    def test_an_error_is_reported_and_signals_and_the_lock_are_restored(self):
        handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "root mismatch"):
                with Control(directory, hours=0) as control:
                    self.assertNotEqual(signal.getsignal(signal.SIGTERM), handlers[signal.SIGTERM])
                    signal.raise_signal(signal.SIGTERM)
                    self.assertTrue(control.stopped())
                    raise ValueError("root mismatch")
            status = self.status(directory)
            self.assertEqual((status["phase"], status["error"]), ("failed", "root mismatch"))
            self.assertEqual({sig: signal.getsignal(sig) for sig in handlers}, handlers)
            with Control(directory, hours=0):
                pass


if __name__ == "__main__":
    unittest.main()
