"""Bounded CPU self-play; workers never train, publish or share a battle."""

import multiprocessing
import os
from concurrent.futures import ProcessPoolExecutor

from .policy import Policy
from .selfplay import play_game


def play_frozen_game(job):
    current = Policy.load(job["current"], job["rulesID"])
    opponent = Policy.load(job["opponent"], job["rulesID"])
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


# One game per core; each worker holds its own battle and a small policy.
MAX_WORKERS = max(1, min(16, os.cpu_count() or 1))


def play_frozen_games(jobs, workers):
    if not 1 <= workers <= MAX_WORKERS or len(jobs) > workers:
        raise ValueError("Schedule at most one game per owned CPU worker")
    if workers == 1:
        return [play_frozen_game(job) for job in jobs]
    # spawn is required on macOS: do not fork a process with a Metal context.
    with ProcessPoolExecutor(
        max_workers=workers, mp_context=multiprocessing.get_context("spawn")
    ) as pool:
        return list(pool.map(play_frozen_game, jobs))
