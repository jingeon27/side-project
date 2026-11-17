"""A run owns its data directory alone, stops on request and leaves its outcome in the status."""

import json
import signal
import tempfile
import unittest
from pathlib import Path

from clash_bot.arena.league.control import Control


class ControlTest(unittest.TestCase):
    def status(self, directory):
        return json.loads((Path(directory) / "arena/control/status.json").read_text())

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
