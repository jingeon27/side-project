import unittest

import numpy as np

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, TILE, Action
from clash_bot.arena.training.attack_comparison import Result, alternatives, compare, gain
from clash_bot.arena.training.bandits import retain_reference
from clash_bot.arena.training.collection import choose, trial_due


class AttackFeedbackTest(unittest.TestCase):
    def test_trials_are_legal_and_a_more_expensive_or_king_waking_trade_is_rejected(self):
        grave = CARD_ID["Graveyard"]
        for seat, y in ((0, 25.5), (1, 6.5)):
            actions = [
                Action(-1),
                Action(5),
                *[Action(grave, round(x * TILE), round(y * TILE)) for x in (2.5, 15.5)],
            ]
            self.assertEqual(set(alternatives(actions, 1, seat)), {0, 1, 2, 3})
        base = Result(400, None, 4000, 4000, 5000, False)
        self.assertEqual(gain(Result(400, None, 4000, 3750, 4500, False), base), 250)
        for other in (
            Result(400, None, 3999, 3750, 5000, False),
            Result(400, None, 4000, 3750, 3999, False),
            Result(400, None, 4000, 3750, 5000, True),
            Result(399, None, 4000, 3750, 5000, False),
        ):
            self.assertEqual(gain(other, base), 0)

    def test_full_native_forks_record_the_same_start_and_both_seats_respond(self):
        order = list(range(8))
        world = Arena(3, [order, order], delays=(22, 22))
        world.play([Action(-1)] * 2, 200)
        source = world.battle.save()
        obs = world.observe(0)
        actions = [Action(*a) for a in obs["legalActions"]]
        baseline = next(i for i, a in enumerate(actions) if a.card == CARD_ID["FirespiritHut"])
        receipt = compare(
            world.clone(),
            [world, world],
            [source, source],
            [0, 0],
            actions,
            baseline,
            0,
            [Policy(), Policy()],
            82,
        )
        self.assertEqual(world.battle.save(), source)
        self.assertEqual(len(receipt["tried"]), 4)
        self.assertTrue(all(len(outcomes) == 2 for outcomes in receipt["outcomes"]))
        self.assertTrue(
            all(row["tick"] == 440 for outcomes in receipt["outcomes"] for row in outcomes)
        )
        if receipt["pair"]:
            pairs = dict(zip(receipt["tried"], receipt["outcomes"], strict=True))
            better, worse = receipt["pair"]
            self.assertTrue(
                all(
                    gain(Result(**a), Result(**b)) > 0
                    for a, b in zip(pairs[better], pairs[worse], strict=True)
                )
            )

    def test_learner_action_and_teacher_anchors_survive_pruning_and_collection(self):
        actions = [Action(-1), Action(1, 0, 0), Action(1, 100, 0), Action(1, 200, 0)]
        kept = retain_reference(actions, [0.1, 0.5, 0.3, 0.1], [0, 1, 2], actions[3])
        self.assertEqual(kept, [0, 1, 3])
        self.assertEqual(
            choose(actions[:3], [0.1, 0.6, 0.3], None, 0, True, actions[3], 0.2), (actions[3], None)
        )
        rng = np.random.default_rng(71)
        tried = {
            choose(actions, [0.00001, 0.4, 0.4, 0.19999], rng, 2000, True, None, 1)[0].card
            for _ in range(100)
        }
        self.assertEqual(tried, {-1, 1})
        ctx = {"hand": ["graveyard"], "elixir": 3}
        history = {}
        self.assertTrue(trial_due(history, 200, ctx, actions, 1))
        self.assertFalse(trial_due(history, 220, ctx, actions, 1))
