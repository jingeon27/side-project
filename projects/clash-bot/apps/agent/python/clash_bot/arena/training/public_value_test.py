import unittest

from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import Action
from clash_bot.arena.training.public_value import estimate, fit, position
from clash_bot.arena.training.storage import seed_for


class PublicLeafTest(unittest.TestCase):
    def test_weights_must_beat_the_tower_baseline_on_unseen_complete_training_games(self):
        games = []
        for i in range(64):
            sign = -1 if i % 2 else 1
            games.append(
                {
                    "completed": True,
                    "rulesID": "r",
                    "gameID": f"train-{i}",
                    "leafExamples": [[0, sign, sign]] * (1 if sign == 1 else 12),
                }
            )
        clean = fit(games, "r")
        self.assertEqual(clean["trainingGames"] + clean["validationGames"], len(games))
        self.assertIsNotNone(clean["weights"])
        self.assertLess(clean["fittedMSE"], clean["baselineMSE"])
        contaminated = [
            dict(games[0], rulesID="old"),
            dict(games[0], completed=False),
            dict(games[0], gameID="holdout-r-0-0"),
        ]
        self.assertEqual(fit(games + contaminated, "r"), clean)
        reversed_validation = [
            dict(g, leafExamples=[[0, row[1], -row[2]] for row in g["leafExamples"]])
            if seed_for("leaf-validation", g["gameID"]) % 4 == 0
            else g
            for g in games
        ]
        self.assertIsNone(fit(reversed_validation, "r")["weights"])
        self.assertIsNone(fit(games[:4], "r")["weights"])

    def test_estimate_uses_only_visible_combat_and_public_enemy_elixir(self):
        arena = Arena(92)
        arena.play([Action(-1)] * 2, 100)
        observation = arena.observe(1)
        features = position(observation)
        observation["state"]["players"][0].update(elixir_milli=9999, hand=[-2] * 4)
        self.assertEqual(position(observation), features)
        self.assertEqual(estimate(observation, None), features[0])
        self.assertEqual(estimate(observation, [0] * len(features)), features[0])
