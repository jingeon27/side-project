"""A sampled screen, searched labels and the matching dense-to-subset normalizers."""

import numpy as np

from ..policy.dense import DenseActions
from ..policy.features import action_features, context_features, forward, hide_towers
from ..policy.projection import project_logits
from ..policy.samples import SparseFeatures
from ..policy.tactics import action_biases
from ..sim.rules import Action
from .improvement import improved_policy


def training_rows(observation, result, screen, chosen, policy, context=None):
    """Search only labels visited moves; card mass still belongs to the full legal set."""
    searched = np.flatnonzero(np.asarray(result["visits"]) > 0).tolist()
    rows = [result["actions"][index] for index in searched]
    available = [Action(*row) for row in observation["legalActions"]]
    retained = [available.index(row) for row in rows]
    if context is None:
        context = screen.read(observation, available)
    state, vectors = context_features(context), action_features(context)
    biases = action_biases(context)
    masked_biases = action_biases({key: value for key, value in context.items() if key != "towers"})
    scores = forward(policy.weights, state, vectors)[0] + biases
    masked_scores = forward(policy.weights, hide_towers(state), vectors)[0] + masked_biases
    families = [row.card for row in available]
    values = np.asarray(result["values"])[searched]
    visits = np.asarray(result["visits"])[searched]

    def target(logits):
        projected = project_logits(logits, families, retained)
        prior = np.exp(projected - np.logaddexp.reduce(projected))
        return improved_policy(prior, values, visits)

    normal, masked = target(scores), target(masked_scores)
    comparison = result.get("defenseComparison") or {"pairs": []}
    return {
        "features": SparseFeatures.of(state).model_dump(),
        "actions": [row.row() for row in rows],
        "actionFeatures": vectors[retained].tolist(),
        "actionBias": biases[retained].tolist(),
        "actionBiasWithoutTowers": masked_biases[retained].tolist(),
        "source": DenseActions.pack(
            vectors, families, biases, masked_biases, retained
        ).model_dump(),
        "target": normal["target"].tolist(),
        "targetWithoutTowers": masked["target"].tolist(),
        "defensePairs": [[pair["preferred"], pair["other"]] for pair in comparison["pairs"]],
        "learning": {
            view: {key: value for key, value in label.items() if key != "target"}
            for view, label in (("normal", normal), ("withoutTowers", masked))
        },
        "chosen": searched.index(chosen),
        "projection": {
            "method": "differentiable_card_partition",
            "sourceCandidates": len(available),
        },
    }
