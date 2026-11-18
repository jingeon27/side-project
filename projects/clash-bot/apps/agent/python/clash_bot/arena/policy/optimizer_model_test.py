"""Real autodiff regression: an omitted tile contributes to its card's gradient."""

import unittest

import mlx.core as mx
import numpy as np

from clash_bot.arena.policy.optimizer import project_scores


class DenseGradientTest(unittest.TestCase):
    def test_unvisited_position_receives_card_mass_gradient_without_a_fake_position_label(self):
        def loss(scores):
            logits = project_scores(
                scores[None, :],
                mx.array([[4, 4, -1]]),
                mx.array([[0, 2]]),
                mx.array([[True, True, True]]),
                mx.array([[True, True]]),
            )[0]
            logp = logits - mx.logsumexp(logits)
            return -mx.sum(mx.array([0.9, 0.1]) * logp)

        derivative = mx.grad(loss)(mx.array([0.0, 0.0, 0.0]))
        np.testing.assert_allclose(np.array(derivative), [-7 / 60, -7 / 60, 7 / 30], atol=1e-6)

    def test_one_representative_does_not_claim_its_unvisited_positions_are_bad(self):
        def loss(scores):
            logits = project_scores(
                scores[None, :],
                mx.array([[4, 4, -1]]),
                mx.array([[0, 2]]),
                mx.array([[True, True, True]]),
                mx.array([[True, True]]),
            )[0]
            return -mx.sum(mx.array([2 / 3, 1 / 3]) * (logits - mx.logsumexp(logits)))

        np.testing.assert_allclose(np.array(mx.grad(loss)(mx.zeros(3))), np.zeros(3), atol=1e-6)
