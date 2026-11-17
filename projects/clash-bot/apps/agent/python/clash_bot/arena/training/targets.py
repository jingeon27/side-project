"""A sampled screen, searched labels and the matching dense-to-subset normalizers."""

import numpy as np

from ..policy.features import action_features, context_features, forward, hide_towers
from ..policy.projection import log_mass_correction
from ..policy.samples import SparseFeatures
from ..policy.tactics import action_biases
from ..sim.rules import Action


def training_rows(observation, result, screen, chosen, policy):
    """Search only labels visited moves; card mass still belongs to the full legal set."""
    searched = np.flatnonzero(np.asarray(result["visits"]) > 0).tolist()
    rows = [result["actions"][index] for index in searched]
    available = [Action(*row) for row in observation["legalActions"]]
    retained = [available.index(row) for row in rows]
    context = screen.read(observation, available)
    state, vectors = context_features(context), action_features(context)
    biases = action_biases(context)
    masked_biases = action_biases({key: value for key, value in context.items() if key != "towers"})
    scores = forward(policy.weights, state, vectors)[0] + biases
    masked_scores = forward(policy.weights, hide_towers(state), vectors)[0] + masked_biases
    families = [row.card for row in available]
    return {
        "features": SparseFeatures.of(state).model_dump(),
        "actions": [row.row() for row in rows],
        "actionFeatures": vectors[retained].tolist(),
        "actionBias": biases[retained].tolist(),
        "actionBiasWithoutTowers": masked_biases[retained].tolist(),
        "actionLogMassCorrection": log_mass_correction(scores, families, retained).tolist(),
        "actionLogMassCorrectionWithoutTowers": log_mass_correction(
            masked_scores, families, retained
        ).tolist(),
        "target": np.asarray(result["target"])[searched].tolist(),
        "chosen": searched.index(chosen),
        "projection": {"method": "frozen_card_partition", "sourceCandidates": len(available)},
    }
