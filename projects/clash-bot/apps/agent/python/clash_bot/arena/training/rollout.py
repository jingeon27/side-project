"""Future policies use no tower readings and estimate the full grid's card masses.

Keep the placement anchors, uniformly sample each card's remaining legal grid, and
weight residual probabilities by inclusion probability. This is an approximation,
not the exact dense partition used by the root and gradient.
"""

from collections import Counter

from ..policy.choice import card_choice, grouped_indices, placement_count_bias
from ..policy.learning_spec import SPEC
from ..policy.projection import importance_priors
from ..sim.candidates import dense_actions, legal_actions


def rollout_choices(world, team, policy, rng):
    state = world.state()
    full = dense_actions(world.battle, team, state)
    if len(full) == 1:
        return full, [1.0]
    lookup = {action: index for index, action in enumerate(full)}
    anchors = {lookup[action] for action in legal_actions(world.battle, team, state)}
    selected = {index: 1.0 for index in anchors}
    full_families = [action.card for action in full]
    for group in grouped_indices(full_families):
        residual = [index for index in group if index not in anchors]
        count = min(len(residual), SPEC.rolloutSamplesPerCard)
        if count:
            for index in rng.choice(residual, count, replace=False):
                selected[int(index)] = len(residual) / count
    indexes = sorted(selected)
    actions = [full[index] for index in indexes]
    families = [action.card for action in actions]
    placement_bias = placement_count_bias(families, Counter(full_families))
    prior, _value = policy.predict(
        world.observe(team, include_legal=False), actions, placement_bias
    )
    return actions, importance_priors(prior, families, [selected[index] for index in indexes])


def frozen_move(world, team, policy, rng):
    actions, prior = rollout_choices(world, team, policy, rng)
    return actions[card_choice([action.card for action in actions], prior)]
