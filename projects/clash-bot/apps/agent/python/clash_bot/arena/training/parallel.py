"""Bounded CPU workers; they never train, publish or share a battle."""

import multiprocessing
import os
import signal
from concurrent.futures import ProcessPoolExecutor

from ..policy.network import Policy
from .deck_practice import practice_orders
from .evaluation import play_pair
from .focused_trial import focused_game
from .pressure import opening_orders, pressure_policy
from .selfplay import play_game


def play_frozen_game(job):
    current = Policy.load(job["current"], job["rulesID"])
    setup = job["setup"]
    if "focusGoal" in setup:
        return focused_game(job, current, Policy.load(job["labelReference"], job["rulesID"]))
    if "pressure" in setup:
        opponent = pressure_policy(setup, job["id"])
        orders = opening_orders(setup, job["seat"], job["id"])
    else:
        opponent = Policy.load(job["opponent"], job["rulesID"])
        orders = practice_orders(setup, job["seat"], job["id"]) if "practiceDeck" in setup else None
    policies = [opponent, opponent]
    policies[job["seat"]] = current
    reference_path = job.get("labelReference", job["current"])
    reference = (
        current if reference_path == job["current"] else Policy.load(reference_path, job["rulesID"])
    )
    collector = (job["seat"], reference) if job.get("collector") else None
    return play_game(
        policies,
        job["id"],
        job["rulesID"],
        simulations=job["simulations"],
        depth=job["depth"],
        setup=setup,
        initial_orders=orders,
        collector=collector,
        leaf_weights=job.get("leafWeights"),
        label_reference=reference,
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
