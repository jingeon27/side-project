"""The fixed yardstick: rule bots that never learn, scored with an interval."""

import unittest

from clash_bot.arena.policy.network import Policy
from clash_bot.arena.sim.candidates import legal_actions
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import TILE, Action, canonical
from clash_bot.arena.training.benchmark import (
    BOTS,
    ScriptedPolicy,
    benchmark,
    deepest_invader,
    defender_bot,
    wilson,
)


class BenchmarkTest(unittest.TestCase):
    def test_rule_bots_choose_a_candidate_and_defend_an_invader(self):
        arena = Arena(4, [[5, 7, 0, 4, 1, 2, 3, 6]] * 2)
        arena.play([Action(-1)] * 2, 100)
        # Red sends its knight down the bridge lane until it crosses into our half.
        bridge = max(
            (action for action in legal_actions(arena.battle, 1) if action.card == 5),
            key=lambda action: canonical(action.x / TILE, action.y / TILE, 1)[1],
        )
        arena.play([Action(-1), bridge], 240)
        observation = arena.observe(0)
        self.assertIsNotNone(deepest_invader(observation))
        actions = [Action(*row) for row in observation["legalActions"]]
        for name, choose in BOTS.items():
            bot = ScriptedPolicy(name, choose, 1)
            probabilities, _ = bot.predict(observation, actions)
            self.assertEqual(probabilities.sum(), 1)
        chosen = actions[defender_bot(observation, actions, None)]
        self.assertGreaterEqual(chosen.card, 0)

    def test_wilson_interval_brackets_the_score(self):
        low, high = wilson(8, 16)
        self.assertLess(low, 0.5)
        self.assertGreater(high, 0.5)
        self.assertEqual(wilson(0, 0), [0.0, 1.0])
        self.assertLess(wilson(16, 16)[0], 1)

    def test_a_policy_is_scored_against_every_bot_in_live_conditions(self):
        policy = Policy(metadata={"version": 3, "rulesID": "rules-a"})
        result = benchmark(policy, "rules-a", pairs=1)
        self.assertEqual(sorted(result["opponents"]), sorted(BOTS))
        for row in result["opponents"].values():
            self.assertEqual(row["games"], 2)
            self.assertEqual(row["wins"] + row["draws"] + row["losses"], 2)
            self.assertLessEqual(row["interval"][0], row["score"])
            self.assertGreaterEqual(row["interval"][1], row["score"])
        self.assertEqual(result["policy"]["version"], 3)


if __name__ == "__main__":
    unittest.main()
