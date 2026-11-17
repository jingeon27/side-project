"""Current card marginals and conditional probabilities of the visited placements.

The optimizer differentiates through the full partition too; a representative tile
must not receive its entire card's gradient.
"""

import numpy as np

from .choice import grouped_indices


def project_logits(scores, families, retained):
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
    result = scores.copy()
    chosen = set(retained)
    for group in grouped_indices(families):
        kept = [i for i in group if i in chosen]
        if kept:
            result[kept] += np.logaddexp.reduce(scores[group]) - np.logaddexp.reduce(scores[kept])
    return result[retained]
