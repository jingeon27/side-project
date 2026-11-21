import unittest

import numpy as np

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, FIELDS, LIVE_DECK, TILE, Action, canonical, deck_ids
from clash_bot.arena.training.attack_comparison import (
    Result,
    alternatives,
    compare,
    gain,
    pool_alternatives,
)
from clash_bot.arena.training.bandits import retain_reference
from clash_bot.arena.training.collection import choose, pool_trial_due, trial_due


class AttackFeedbackTest(unittest.TestCase):
    def test_pool_deck_can_save_or_spend_in_native_worlds_without_changing_its_actual_move(self):
        card = CARD_ID["Golem"]
        world = Arena(
            3, [deck_ids("golem"), deck_ids(LIVE_DECK)], ["golem", LIVE_DECK], delays=(22, 22)
        )
        world.play([Action(-1)] * 2, 100)
        before = world.battle.save()
        actions = [Action(*a) for a in world.observe(0)["legalActions"]]
        player = world.state()["players"][0]
        baseline = next(i for i, a in enumerate(actions) if a.card >= 0)
        history = {}
        self.assertTrue(pool_trial_due(history, 100, player, actions, baseline, card))
        self.assertFalse(pool_trial_due(history, 120, player, actions, baseline, card))
        self.assertTrue(pool_trial_due(history, 340, player, actions, baseline, card))
        self.assertFalse(pool_trial_due(history, 580, player, actions, baseline, card))
        self.assertFalse(
            pool_trial_due({}, 100, {**player, "pending_cost": 1}, actions, baseline, card)
        )
        self.assertFalse(
            pool_trial_due({}, 100, {**player, "elixir_milli": 8000}, actions, baseline, card)
        )
        self.assertFalse(pool_trial_due({}, 100, player, actions, actions.index(Action(-1)), card))
        receipt = compare(
            world.clone(),
            [world, world],
            [before, before],
            [0, 0],
            actions,
            baseline,
            0,
            [Policy(), Policy()],
            43,
            pool_card=card,
            prior=[1] * len(actions),
        )
        self.assertEqual(receipt["tried"], [baseline, actions.index(Action(-1))])
        self.assertTrue(receipt["reserving"])
        self.assertEqual(receipt["ticks"], 480)
        self.assertTrue(all(casts == [True, True] for casts in receipt["executedCasts"].values()))
        self.assertEqual(receipt["pair"], [actions.index(Action(-1)), baseline])
        self.assertEqual(world.battle.save(), before)
        self.assertEqual(world.history, [])

    def test_funded_pool_card_compares_the_best_legal_placement_on_each_lane(self):
        target = CARD_ID["HogRider"]
        actions = [
            Action(-1),
            Action(0),
            Action(target, TILE, 2 * TILE),
            Action(target, 3 * TILE, 2 * TILE),
            Action(target, 12 * TILE, 5 * TILE),
            Action(target, 15 * TILE, 2 * TILE),
        ]
        prior = [0.1, 0.5, 0.1, 0.15, 0.12, 0.03]
        self.assertEqual(pool_alternatives(actions, 1, target, prior, 0, []), [1, 0, 3, 4])
        self.assertEqual(pool_alternatives(actions, 3, target, prior, 0, []), [3, 0, 4])

    def test_global_attacks_can_challenge_defensive_placements_at_living_enemy_towers(self):
        entities = Arena(5).state()["entities"]
        for seat in (0, 1):
            for name in ("GoblinBarrel", "GoblinDrill", "Graveyard"):
                card = CARD_ID[name]
                coords = [
                    (4, 6),
                    (14, 6),
                    (3.5, 25.5),
                    (14.5, 25.5),
                    (2.5, 25.5),
                    (15.5, 25.5),
                    (9, 29),
                ]
                actions = [
                    Action(-1),
                    *[
                        Action(card, *(round(v * TILE) for v in canonical(x, y, seat)))
                        for x, y in coords
                    ],
                ]
                prior = [0.2, 0.4, 0.35, 0.01, 0.01, 0.01, 0.01, 0.01]
                options = pool_alternatives(actions, 1, card, prior, seat, entities)
                targets = {5, 6} if name == "Graveyard" else {3, 4}
                self.assertEqual(set(options), {0, 1, 2} | targets)
                # Remove one Princess Tower and leave both Kings standing. Neither can be a target.
                remaining = [
                    e
                    for e in entities
                    if not (e[FIELDS["team"]] != seat and e[FIELDS["tower_slot"]] == 1)
                ]
                smaller = pool_alternatives(actions, 1, card, prior, seat, remaining)
                self.assertEqual(len(smaller), 4)
                self.assertEqual(len(targets.intersection(smaller)), 1)

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
