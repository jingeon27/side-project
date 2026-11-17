"""One self-play run's hold on the data directory: its lock, stop requests and status file."""

import fcntl
import json
import os
import signal
import time
import uuid
from pathlib import Path

from clash_bot.files import atomic_json


class Control:
    """Entered once per run. Only the owner of the lock writes games, checkpoints and status.

    Leaving reports `stopped`, or `failed` with the error, restores the signal handlers and
    releases the lock.
    """

    def __init__(self, data_dir, hours):
        self.directory = Path(data_dir) / "arena/control"
        self.hours = hours
        self.interrupted = []

    def __enter__(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = (self.directory / "lock.json").open("a+")
        try:
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise RuntimeError("A local self-play process is already running")
        self.owner = {"id": str(uuid.uuid4()), "pid": os.getpid(), "startedAt": time.time()}
        self.lock.seek(0)
        self.lock.truncate()
        json.dump(self.owner, self.lock)
        self.lock.flush()
        self.state = {
            **self.owner,
            "phase": "initializing",
            "completedGenerations": 0,
            "completedGames": 0,
        }
        self.handlers = {
            sig: signal.signal(sig, lambda *_: self.interrupted.append(True))
            for sig in (signal.SIGINT, signal.SIGTERM)
        }
        self.deadline = time.monotonic() + self.hours * 3600 if self.hours else float("inf")
        return self

    def __exit__(self, _kind, error, _traceback):
        try:
            if error is None:
                self.report({"phase": "stopped"})
            elif isinstance(error, Exception):
                self.report({"phase": "failed", "error": str(error)})
        finally:
            for sig, handler in self.handlers.items():
                signal.signal(sig, handler)
            fcntl.flock(self.lock.fileno(), fcntl.LOCK_UN)
            self.lock.close()

    def report(self, values):
        self.state.update(values)
        self.state["updatedAt"] = time.time()
        atomic_json(self.directory / "status.json", self.state)

    def stopped(self):
        """A signal, the time limit, or a stop request addressed to this run."""
        stop = self.directory / "stop.json"
        return (
            bool(self.interrupted)
            or time.monotonic() >= self.deadline
            or (stop.exists() and json.loads(stop.read_text()).get("id") == self.owner["id"])
        )
