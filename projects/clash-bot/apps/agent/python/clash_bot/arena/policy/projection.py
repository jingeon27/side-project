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


def importance_priors(probabilities, families, multiplicities):
    """Estimate full card mass, without weighting a sampled tile's conditional position.

    Anchors have weight one; m uniform samples of N residual tiles have weight N/m.
    Unnormalized card masses are unbiased; normalized finite-sample odds remain approximate.
    """
    prior, weights = np.asarray(probabilities, np.float64), np.asarray(multiplicities, np.float64)
    if (
        len(prior) != len(families)
        or prior.shape != weights.shape
        or not len(prior)
        or not np.isfinite(prior).all()
        or not np.isfinite(weights).all()
        or np.any(prior < 0)
        or np.any(weights < 1)
        or prior.sum() <= 0
    ):
        raise ValueError("Invalid sampled rollout probabilities")
    result = np.zeros(len(prior), np.float64)
    for group in grouped_indices(families):
        selected = prior[group].sum()
        if selected > 0:
            result[group] = prior[group] * float(prior[group] @ weights[group]) / selected
    return result / result.sum()
