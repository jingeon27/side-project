"""Bounded CPU self-play; workers never train, publish or share a battle."""

import multiprocessing
from concurrent.futures import ProcessPoolExecutor

from .policy import Policy
from .selfplay import play_game


def play_frozen_game(job):
    current = Policy.load(job["current"], job["rulesID"])
    opponent = Policy.load(job["opponent"], job["rulesID"])
    policies = [opponent, opponent]
    policies[job["seat"]] = current
    return play_game(
        policies, job["id"], job["rulesID"], simulations=job["simulations"], depth=job["depth"]
    )


def play_frozen_games(jobs, workers):
    if not 1 <= workers <= 4 or len(jobs) > workers:
        raise ValueError("Schedule at most one game per owned CPU worker")
    if workers == 1:
        return [play_frozen_game(job) for job in jobs]
    # spawn is required on macOS: do not fork a process with a Metal context.
    with ProcessPoolExecutor(
        max_workers=workers, mp_context=multiprocessing.get_context("spawn")
    ) as pool:
        return list(pool.map(play_frozen_game, jobs))
