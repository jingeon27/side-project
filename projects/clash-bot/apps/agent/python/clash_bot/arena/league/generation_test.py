import unittest
from pathlib import Path

import numpy as np

from clash_bot.arena.league.generation import scheduled


class TrainingOpponentsTest(unittest.TestCase):
    def test_defender_curriculum_uses_a_quarter_of_games_without_updating_pfsp_scores(self):
        league = {"learner": 4, "opponents": [{"version": 2, "wins": 0, "games": 8}]}
        jobs = scheduled(
            Path("/unused"),
            league,
            {"id": "rules"},
            5,
            range(16),
            {"simulations": 16, "depth": 6},
            np.random.default_rng(7),
        )
        scripted = [job for job in jobs if job["opponent"] == "scripted:defender"]
        self.assertEqual(len(scripted), 4)
        self.assertEqual({job["seat"] for job in scripted}, {0, 1})
        self.assertTrue(all(job["selected"] is None for job in scripted))
        self.assertEqual(sum(job["selected"] == 2 for job in jobs), 4)
