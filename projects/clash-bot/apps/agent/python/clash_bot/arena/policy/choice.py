"""Choose a card's marginal probability first, then its conditional placement.

Waiting and the ability each have their own family. Splitting a card's probability over
many legal tiles must not turn it into a hundred separate votes against the single wait.
"""

import math
from collections import Counter

import numpy as np


def placement_count_bias(families, counts=None):
    counts = counts if counts is not None else Counter(families)
    return np.array([-math.log(counts[family]) for family in families], dtype=np.float32)


def grouped_indices(families):
    groups = {}
    for index, family in enumerate(families):
        groups.setdefault(family, []).append(index)
    return list(groups.values())


def distribution(families, probabilities):
    weights = np.asarray(probabilities, np.float64)
    if (
        len(families) == 0
        or weights.shape != (len(families),)
        or not np.isfinite(weights).all()
        or (weights < 0).any()
        or weights.sum() <= 0
    ):
        raise ValueError("Card choice requires aligned, finite, nonnegative probabilities")
    groups = grouped_indices(families)
    mass = np.array([math.fsum(weights[indexes]) for indexes in groups])
    return weights, groups, mass


def card_choice(families, probabilities):
    weights, groups, mass = distribution(families, probabilities)
    group = groups[int(np.argmax(mass))]
    return max(group, key=lambda index: weights[index])


def sample_card(families, probabilities, rng, temperature):
    if not math.isfinite(temperature) or temperature <= 0:
        raise ValueError("Card sampling temperature must be positive")
    weights, groups, mass = distribution(families, probabilities)

    def temper(values):
        # Dividing by the largest value avoids underflow at small temperatures.
        scaled = (values / values.max()) ** (1 / temperature)
        return scaled / scaled.sum()

    group = groups[int(rng.choice(len(groups), p=temper(mass)))]
    return group[int(rng.choice(len(group), p=temper(weights[group])))]
