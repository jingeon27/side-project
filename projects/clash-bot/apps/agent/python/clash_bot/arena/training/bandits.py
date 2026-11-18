"""Card/placement PUCT bandits and a root subset that preserves each card's prior mass."""

import math

import numpy as np

from ..policy.choice import grouped_indices
from ..sim.rules import TILE, Action


class Node:
    def __init__(self):
        self.own, self.children = {}, {}
        self.visits = 0


def best(scores, rng):
    values = np.asarray(scores)
    return int(rng.choice(np.flatnonzero(values >= values.max() - 1e-12)))


def pick(edges, actions, priors, rng, explore, cover=False):
    for action, prior in zip(actions, priors):
        if action not in edges:
            edges[action] = {"n": 0, "w": 0.0, "p": float(prior), "available": 0}
        edges[action]["available"] += 1
    groups = grouped_indices([action.card for action in actions])
    rows = [edges[action] for action in actions]

    def group_score(indexes):
        n = sum(rows[i]["n"] for i in indexes)
        w = sum(rows[i]["w"] for i in indexes)
        p = sum(priors[i] for i in indexes)
        available = max(rows[i]["available"] for i in indexes)
        return w / max(1, n) + explore * p * math.sqrt(available) / (1 + n)

    # With a bounded root, try every selected action before reusing a favourite. Hidden-hand
    # unavailability never counts as a visit; the caller only supplies this world's legal moves.
    unvisited = [i for i, row in enumerate(rows) if row["n"] == 0]
    eligible = (
        [[i for i in group if i in unvisited] for group in groups]
        if cover and unvisited
        else groups
    )
    eligible = [group for group in eligible if group]
    group = eligible[best([group_score(indexes) for indexes in eligible], rng)]
    prior_sum = sum(priors[i] for i in group)

    def placement_score(i):
        row = rows[i]
        conditional = priors[i] / prior_sum if prior_sum else 0.0
        return row["w"] / max(1, row["n"]) + explore * conditional * math.sqrt(row["available"]) / (
            1 + row["n"]
        )

    return actions[group[best([placement_score(i) for i in group], rng)]]


def root_subset(actions, prior, rng, size, explore, focus=()):
    """Keep the original best of each family, then compare separated alternatives."""
    if len(actions) <= size:
        return list(range(len(actions)))
    groups = grouped_indices([action.card for action in actions])
    scores = np.log(np.maximum(prior, 1e-12))
    # 비교 기준인 각 카드의 원래 최선 위치는 잡음으로 지우지 않는다. 남는 예산만 탐색한다.
    ranked = sorted(groups, key=lambda group: -sum(prior[i] for i in group))
    keep = [max(group, key=lambda i: prior[i]) for group in ranked[:size]]
    if explore:
        scores = scores + rng.gumbel(size=len(scores))
    wait = actions.index(Action(-1)) if Action(-1) in actions else None
    if wait is not None and wait not in keep:
        keep[-1] = wait
    by_family = {}
    ranked_extra = np.argsort(-scores, kind="stable").tolist()
    for index in ranked_extra:
        by_family.setdefault(actions[index].card, []).append(index)
    order = [actions[group[0]].card for group in ranked]
    if explore:
        rng.shuffle(order)
    order.sort(key=lambda family: family not in focus)
    retained = {family: [i for i in keep if actions[i].card == family] for family in order}
    separation = (1.5 * TILE) ** 2

    def spaced(index, family):
        candidate = actions[index]
        return all(
            (candidate.x - actions[other].x) ** 2 + (candidate.y - actions[other].y) ** 2
            >= separation
            for other in retained[family]
        )

    while len(keep) < size:
        before = len(keep)
        for family in order:
            index = next((i for i in by_family[family] if spaced(i, family)), None)
            if index is not None:
                keep.append(index)
                retained[family].append(index)
            if len(keep) == size:
                break
        if len(keep) == before:
            break
    for index in ranked_extra:
        if len(keep) >= size:
            break
        if index not in keep:
            keep.append(index)
    return sorted(keep)


def root_priors(actions, prior, keep):
    """Pruning 250 tiles down to two must retain that card's original probability mass."""
    groups = grouped_indices([action.card for action in actions])
    result = np.zeros(len(actions), np.float64)
    for group in groups:
        retained = [i for i in group if i in keep]
        if retained:
            mass = sum(prior[i] for i in group)
            selected = sum(prior[i] for i in retained)
            if selected:
                result[retained] = prior[retained] * mass / selected
    selected = result[keep]
    return selected / selected.sum()


def exploration_prior(actions, prior, rng):
    groups = grouped_indices([action.card for action in actions])
    masses = rng.dirichlet(np.full(len(groups), 0.2))
    noise = np.zeros(len(actions))
    for group, mass in zip(groups, masses):
        noise[group] = mass * rng.dirichlet(np.full(len(group), 0.2))
    return 0.75 * prior + 0.25 * noise
