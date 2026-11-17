"""Bounded CPU workers; they never train, publish or share a battle."""

import multiprocessing
import os
import signal
from concurrent.futures import ProcessPoolExecutor

from ..policy.network import Policy
from .benchmark import ScriptedPolicy, defender_bot
from .evaluation import play_pair
from .selfplay import play_game
from .storage import seed_for


def play_frozen_game(job):
    current = Policy.load(job["current"], job["rulesID"])
    opponent = (
        ScriptedPolicy("defender", defender_bot, seed_for("training-defender", job["id"]))
        if job["opponent"] == "scripted:defender"
        else Policy.load(job["opponent"], job["rulesID"])
    )
    policies = [opponent, opponent]
    policies[job["seat"]] = current
    return play_game(
        policies,
        job["id"],
        job["rulesID"],
        simulations=job["simulations"],
        depth=job["depth"],
        setup=job["setup"],
    )


def play_frozen_pair(job):
    """Both seats of one evaluation pair between two saved checkpoints."""
    challenger = Policy.load(job["challenger"], job["rulesID"])
    champion = Policy.load(job["champion"], job["rulesID"])
    return play_pair(challenger, champion, job["rulesID"], job["identity"], job["setup"])


# One game per core; each worker holds its own battle and a small policy.
MAX_WORKERS = max(1, min(16, os.cpu_count() or 1))


def ignore_interrupt():
    # A terminal interrupt reaches every process of the run. The owner asks for a stop; a
    # worker finishes its game so the owner can still save it.
    signal.signal(signal.SIGINT, signal.SIG_IGN)


class Workers:
    """The worker processes of one run, started once and reused for every batch.

    A single worker runs jobs in the owner's process, with no pool.
    """

    def __init__(self, count):
        if not 1 <= count <= MAX_WORKERS:
            raise ValueError(f"Use 1..{MAX_WORKERS} CPU workers")
        self.count = count
        self.pool = None

    def __enter__(self):
        if self.count > 1:
            # spawn is required on macOS: do not fork a process with a Metal context.
            self.pool = ProcessPoolExecutor(
                max_workers=self.count,
                mp_context=multiprocessing.get_context("spawn"),
                initializer=ignore_interrupt,
            )
        return self

    def __exit__(self, *_error):
        if self.pool:
            self.pool.shutdown()

    def map(self, play, jobs):
        """Results in job order; at most one job per worker at a time."""
        if len(jobs) > self.count:
            raise ValueError("Schedule at most one game per owned CPU worker")
        if self.pool is None:
            return [play(job) for job in jobs]
        return list(self.pool.map(play, jobs))
