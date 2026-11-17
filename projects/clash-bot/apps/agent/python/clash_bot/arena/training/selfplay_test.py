"""Self-play draws a setup per game; training reads candidates through the screen's errors."""

import unittest

import numpy as np

from clash_bot.arena.policy.context import decision_context
from clash_bot.arena.policy.network import Policy
from clash_bot.arena.policy.noise import PerceptionNoise, perceive
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import DECKS, LIVE_DECK, SPEC, Action
from clash_bot.arena.study.export import export
from clash_bot.arena.training.selfplay import (
    SELFPLAY,
    live_mirror,
    live_setup,
    play_game,
    setup_for,
)


class SetupTest(unittest.TestCase):
    def test_setups_are_seeded_by_game_and_half_are_the_live_mirror(self):
        games = [f"train-1-{index}" for index in range(400)]
        setups = [setup_for(game) for game in games]
        self.assertEqual(setups, [setup_for(game) for game in games])
        self.assertTrue(all(name in DECKS for setup in setups for name in setup["decks"]))
        mirrors = sum(setup["decks"] == [LIVE_DECK, LIVE_DECK] for setup in setups) / len(setups)
        self.assertGreater(mirrors, 0.45)
        self.assertLess(mirrors, 0.65)
        low, high = SELFPLAY.commandDelayTicks
        delays = {delay for setup in setups for delay in setup["delays"]}
        self.assertTrue(delays <= set(range(low, high + 1)) and len(delays) > 3)
        levels = {level for setup in setups for level in setup["levels"]}
        self.assertEqual(levels, {SPEC["level"] + offset for offset in SELFPLAY.levelOffsets})
        self.assertEqual(live_setup()["delays"], [SPEC["liveCommandDelayTicks"]] * 2)

    def test_a_mixed_deck_game_runs_with_delays_and_stays_out_of_the_qwen_studies(self):
        policy = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        setup = {"decks": ["bait", "hog_cycle"], "delays": [18, 26], "levels": [10, 12]}
        game = play_game(
            [policy, policy],
            "mixed-contract",
            "rules-a",
            simulations=2,
            depth=2,
            max_ticks=400,
            setup=setup,
        )
        self.assertEqual(game["setup"], setup)
        self.assertGreater(game["decisions"], 0)
        self.assertEqual(game["rejectedCommands"], 0)
        self.assertFalse(live_mirror(game))
        completed = {**game, "completed": True, "samples": [{"search": {"simulations": 8}}]}
        self.assertIsNone(export("/nonexistent", [completed]))

    def test_deployed_play_needs_no_search(self):
        policy = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        game = play_game(
            [policy, policy], "deployed", "rules-a", simulations=0, training=False, max_ticks=400
        )
        self.assertEqual((game["searchSimulations"], game["samples"]), (0, []))
        self.assertGreater(game["decisions"], 0)


class PerceptionNoiseTest(unittest.TestCase):
    def test_training_reads_a_noisy_copy_and_leaves_the_true_context(self):
        arena = Arena(2)
        arena.play([Action(-1)] * 2, 100)
        for _ in range(4):
            plays = [
                next(
                    (Action(*row) for row in arena.observe(team)["legalActions"] if row[0] >= 0),
                    Action(-1),
                )
                for team in (0, 1)
            ]
            arena.play(plays, 40)
        context = decision_context(arena.observe(0), [])
        bodies = sum(len(context["bodies"][side]) for side in ("own", "enemy"))
        self.assertGreater(bodies, 0)
        never = PerceptionNoise(
            missRate=0,
            unknownRate=0,
            jitterTiles=0,
            motionSeenRate=1,
            healthSeenRate=1,
            effectMissRate=0,
        )
        self.assertEqual(
            perceive(context, np.random.default_rng(1), never)["bodies"], context["bodies"]
        )
        always = never.model_copy(
            update={
                "unknownRate": 1,
                "jitterTiles": 0.5,
                "motionSeenRate": 0,
                "healthSeenRate": 0,
                "effectMissRate": 1,
            }
        )
        read = perceive(context, np.random.default_rng(1), always)
        seen = [body for side in ("own", "enemy") for body in read["bodies"][side]]
        self.assertEqual(len(seen), bodies)
        self.assertTrue(all(body["kind"] == "?" and body["hp"] is None for body in seen))
        self.assertTrue(all(body["velocity"] is None for body in seen))
        self.assertEqual(read["effects"], [])
        self.assertNotEqual(context["bodies"]["own"], read["bodies"]["own"])
        missing = never.model_copy(update={"missRate": 1})
        self.assertEqual(
            perceive(context, np.random.default_rng(1), missing)["bodies"], {"own": [], "enemy": []}
        )


if __name__ == "__main__":
    unittest.main()
