"""Self-play draws a setup per game; training reads candidates through the screen's errors."""

import unittest
from unittest.mock import patch

import numpy as np

from clash_bot.arena.policy.context import decision_context
from clash_bot.arena.policy.network import Policy
from clash_bot.arena.policy.noise import PerceptionNoise, perceive
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import DECKS, LIVE_DECK, SPEC, Action
from clash_bot.arena.study.export import export
from clash_bot.arena.training.benchmark import ScriptedPolicy, defender_bot
from clash_bot.arena.training.search import search
from clash_bot.arena.training.selfplay import (
    SELFPLAY,
    live_mirror,
    live_setup,
    play_game,
    setup_for,
)


class MatchedObservationTest(unittest.TestCase):
    def test_no_improvement_teacher_replays_the_deployed_policy_without_a_second_screen_sample(
        self,
    ):
        policy = Policy()
        baseline = play_game(
            [policy, policy],
            "matched-root-observation",
            "rules-test",
            simulations=0,
            training=False,
            max_ticks=600,
        )

        def unchanged(observation, _policy, _seed, **kwargs):
            return {
                "actions": [Action(*a) for a in observation["legalActions"]],
                "target": kwargs["observed_prior"],
                "simulations": 0,
            }

        with patch("clash_bot.arena.training.selfplay.search", side_effect=unchanged):
            searched = play_game(
                [policy, policy],
                "matched-root-observation",
                "rules-test",
                simulations=16,
                training=False,
                max_ticks=600,
            )
        self.assertEqual(searched["publicHistory"], baseline["publicHistory"])
        self.assertEqual(searched["crowns"], baseline["crowns"])


class SetupTest(unittest.TestCase):
    def test_scripted_opponent_plays_its_rule_directly_and_never_becomes_a_search_teacher(self):
        policy = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        scripted = ScriptedPolicy("defender", defender_bot, 4)
        with patch("clash_bot.arena.training.selfplay.search", wraps=search) as observed:
            game = play_game(
                [policy, scripted],
                "defender-training",
                "rules-a",
                simulations=2,
                depth=1,
                max_ticks=400,
            )
        self.assertTrue(observed.call_args_list)
        self.assertEqual({call.args[0]["team"] for call in observed.call_args_list}, {0})
        self.assertEqual(game["policies"][1]["scripted"], "defender")
        self.assertEqual(game["rejectedCommands"], 0)

    def test_setups_are_seeded_by_game_and_half_are_the_live_mirror(self):
        games = [f"train-1-{index}" for index in range(400)]
        setups = [setup_for(game) for game in games]
        self.assertEqual(setups, [setup_for(game) for game in games])
        self.assertTrue(all(name in DECKS for setup in setups for name in setup["decks"]))
        mirrors = sum(setup["decks"] == [LIVE_DECK, LIVE_DECK] for setup in setups) / len(setups)
        self.assertGreater(mirrors, 0.45)
        self.assertLess(mirrors, 0.65)
        own_matchups = sum(
            LIVE_DECK in setup["decks"] and len(set(setup["decks"])) == 2 for setup in setups
        ) / len(setups)
        self.assertGreater(own_matchups, 0.18)
        self.assertLess(own_matchups, 0.4)
        self.assertEqual({name for setup in setups for name in setup["decks"]}, set(DECKS))
        low, high = SELFPLAY.commandDelayTicks
        delays = {delay for setup in setups for delay in setup["delays"]}
        self.assertTrue(delays <= set(range(low, high + 1)) and len(delays) > 3)
        levels = {level for setup in setups for level in setup["levels"]}
        self.assertEqual(levels, {SPEC["level"] + offset for offset in SELFPLAY.levelOffsets})
        self.assertEqual(live_setup()["delays"], [SPEC["liveCommandDelayTicks"]] * 2)
        first, last = SELFPLAY.decisionPhaseTicks
        phases = {setup["phase"] for setup in setups}
        self.assertTrue(phases <= set(range(first, last + 1)) and len(phases) > 10)
        self.assertLess(last, SELFPLAY.decisionTicks)
        # A series of live games differs only in how far apart the two clocks run.
        series = [live_setup(index) for index in range(SELFPLAY.decisionTicks)]
        self.assertEqual(len({setup["phase"] for setup in series}), SELFPLAY.decisionTicks)
        self.assertEqual(
            {key: value for key, value in series[3].items() if key != "phase"},
            {key: value for key, value in live_setup().items() if key != "phase"},
        )

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

    def test_each_side_decides_on_its_own_clock_through_its_own_screen(self):
        class Recorder:
            """Waits, and records when it was asked and what its screen had read."""

            metadata = {"version": 0}

            def __init__(self):
                self.asked = []

            def deployed(self, observation, actions, screen):
                context = screen.read(observation, actions, towers=False)
                self.asked.append((observation["state"]["tick"], context))
                return np.eye(len(actions))[0]

            def checksum(self):
                return "0" * 64

        for phase in (0, 7):
            sides = [Recorder(), Recorder()]
            setup = {**live_setup(), "phase": phase}
            play_game(
                sides,
                "clocks",
                "rules-a",
                simulations=0,
                training=False,
                max_ticks=300,
                setup=setup,
            )
            with self.subTest(phase=phase):
                for team, side in enumerate(sides):
                    ticks = [tick for tick, _context in side.asked]
                    self.assertGreater(len(ticks), 5)
                    self.assertEqual(
                        {tick % SELFPLAY.decisionTicks for tick in ticks}, {phase * team}
                    )
                    for _tick, context in side.asked:
                        self.assertNotIn("towers", context)
                        self.assertEqual(context["enemyElixir"]["min"], 0)


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
            playMissRate=0,
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
