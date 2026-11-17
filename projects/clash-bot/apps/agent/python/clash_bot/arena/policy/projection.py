"""Retain card probability mass when a dense placement set becomes a training subset.

These offsets reproduce the collecting policy exactly. They are frozen sampled partitions,
not claims about the later learner's unseen placements or new tactical mechanics.
"""

import numpy as np

from .choice import grouped_indices


def log_mass_correction(scores, families, retained):
    scores = np.asarray(scores, np.float64)
    if (
        len(scores) != len(families)
        or not np.isfinite(scores).all()
        or not retained
        or len(set(retained)) != len(retained)
        or min(retained) < 0
        or max(retained) >= len(scores)
    ):
        raise ValueError("Invalid dense policy projection")
    offsets = np.zeros(len(scores), np.float64)
    chosen = set(retained)
    for group in grouped_indices(families):
        kept = [i for i in group if i in chosen]
        if kept:
            offsets[kept] = np.logaddexp.reduce(scores[group]) - np.logaddexp.reduce(scores[kept])
    return offsets[retained].astype(np.float32)
