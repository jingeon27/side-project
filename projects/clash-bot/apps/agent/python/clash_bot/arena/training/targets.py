"""Visited search targets, encoded through one sampled screen with matching mechanics offsets."""

import numpy as np

from ..policy.features import action_features, context_features
from ..policy.tactics import action_biases


def training_rows(observation, result, screen, chosen):
    """Unvisited and unsearched placements have no known value, not a negative label."""
    kept = np.flatnonzero(result["target"] > 0).tolist()
    rows = [result["actions"][index] for index in kept]
    context = screen.read(observation, rows)
    return (
        rows,
        context_features(context),
        action_features(context),
        action_biases(context),
        action_biases({key: value for key, value in context.items() if key != "towers"}),
        result["target"][kept].tolist(),
        kept.index(chosen),
    )
