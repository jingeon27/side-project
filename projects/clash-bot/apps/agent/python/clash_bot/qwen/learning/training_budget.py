"""Cooperative pacing for background Qwen work; never a hardware utilization cap."""

import math
import os
import plistlib
import subprocess
import threading
import time
from collections import deque
from contextlib import contextmanager
from functools import cache

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR


def gpu_usage():
    """Read system-wide Apple GPU activity without elevated privileges."""
    try:
        raw = subprocess.check_output(
            ["/usr/sbin/ioreg", "-a", "-r", "-c", "IOAccelerator"], timeout=1
        )
        devices = plistlib.loads(raw)
    except (OSError, subprocess.SubprocessError, plistlib.InvalidFileException):
        return None

    def values(node):
        if isinstance(node, dict):
            stats = node.get("PerformanceStatistics", {})
            value = stats.get("Device Utilization %")
            if type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 100:
                yield value / 100
            for value in node.values():
                yield from values(value)
        elif isinstance(node, list):
            for value in node:
                yield from values(value)

    return max(values(devices), default=None)


class TrainingBudget:
    def __init__(self, target, synchronize, *, clock=time.monotonic, sleep=time.sleep):
        if not math.isfinite(target) or not 0.1 <= target < 1:
            raise ValueError("CLASH_BOT_GPU_TARGET must be >=0.1 and <1")
        self.target = target
        self.synchronize = synchronize
        self.clock, self.sleep = clock, sleep
        self.duty = target * 0.85
        self.samples = deque(maxlen=20)  # Ten seconds of 500ms samples, including rests.
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = None
        self.active_seconds = self.rest_seconds = self.cycles = 0
        self.path = DATA_DIR / "resources" / f"qwen-budget-{os.getpid()}.json"

    def snapshot(self):
        with self.lock:
            samples = list(self.samples)
            return {
                "format": "qwen-background-budget-v1",
                "pid": os.getpid(),
                "targetGPU": self.target,
                "scope": "background_training_only",
                "hardCap": False,
                "gpuWindowSeconds": 10,
                "gpuSamples": len(samples),
                "gpuAverage": sum(samples) / len(samples) if samples else None,
                "duty": self.duty,
                "workSeconds": self.active_seconds,
                "restSeconds": self.rest_seconds,
                "cycles": self.cycles,
            }

    def monitor(self):
        while not self.stop.is_set():
            value = gpu_usage()
            with self.lock:
                if value is None:
                    self.samples.clear()
                else:
                    self.samples.append(value)
            atomic_json(self.path, self.snapshot())
            self.stop.wait(0.5)

    def start(self):
        if self.thread is None:
            self.thread = threading.Thread(
                target=self.monitor, name="qwen-load-budget", daemon=True
            )
            self.thread.start()

    @contextmanager
    def work(self):
        started = self.clock()
        yield
        self.synchronize()  # Finish GPU work before counting any interval as rest.
        active = max(0, self.clock() - started)
        with self.lock:
            average = sum(self.samples) / len(self.samples) if len(self.samples) >= 4 else None
            if average is not None and average > self.target - 0.02:
                self.duty = max(0.2, self.duty * 0.9)
            elif average is not None and average < self.target - 0.08:
                self.duty = min(self.target, self.duty + 0.01)
            rest = min(2, active * (1 / self.duty - 1))
        self.sleep(rest)
        with self.lock:
            self.active_seconds += active
            self.rest_seconds += rest
            self.cycles += 1

    def close(self):
        self.stop.set()
        if self.thread is not None:
            self.thread.join(timeout=3)
        atomic_json(self.path, {**self.snapshot(), "phase": "stopped"})


@cache
def training_budget():
    target = os.environ.get("CLASH_BOT_GPU_TARGET")
    if target is None:
        return None
    import mlx.core as mx

    return TrainingBudget(float(target), mx.synchronize)


@contextmanager
def training_work():
    budget = training_budget()
    if budget is None:
        yield
        return
    budget.start()
    with budget.work():
        yield


def close_training_budget():
    budget = training_budget()
    if budget is not None:
        budget.close()
