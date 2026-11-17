"""Compare public fields with a bounded mobile-position error, never relaxed combat facts."""

import math
from collections import defaultdict


def grouped(units):
    groups = defaultdict(list)
    for row in units:
        # Team, kind, card, tower slot, HP, max HP and unit type must match exactly.
        groups[tuple(row[:4]) + tuple(row[6:])].append((row[4], row[5]))
    return groups


def matched_distance(left, right, tolerance):
    """A full bipartite matching avoids greedy mistakes among identical crowded troops."""
    edges = [
        sorted(
            (
                (j, math.dist(point, other))
                for j, other in enumerate(right)
                if math.dist(point, other) <= tolerance
            ),
            key=lambda item: item[1],
        )
        for point in left
    ]
    owners = {}

    def assign(i, seen):
        for j, distance in edges[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in owners or assign(owners[j][0], seen):
                owners[j] = (i, distance)
                return True
        return False

    if not all(assign(i, set()) for i in range(len(left))):
        return None
    return max((distance for _, distance in owners.values()), default=0.0)


def position_error(observed, candidate, tolerance):
    """Maximum matched mobile displacement, or None for an incompatible public field.

    Coordinates/tolerance use the same units. Towers/buildings cannot move. Spells, counts,
    unit identity and hit points remain exact even when a mobile position is uncertain.
    """
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("Position tolerance must be finite and nonnegative")
    if observed == candidate:
        return 0.0
    if observed["towers"] != candidate["towers"] or observed["spells"] != candidate["spells"]:
        return None
    left, right = grouped(observed["units"]), grouped(candidate["units"])
    if left.keys() != right.keys():
        return None
    maximum = 0.0
    for signature, points in left.items():
        if len(points) != len(right[signature]):
            return None
        distance = matched_distance(points, right[signature], tolerance if signature[1] == 0 else 0)
        if distance is None:
            return None
        maximum = max(maximum, distance)
    return maximum
