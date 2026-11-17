import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from clash_bot.arena.league.generation import learn, scheduled


class TrainingOpponentsTest(unittest.TestCase):
    def test_defender_curriculum_uses_a_quarter_of_games_without_updating_pfsp_scores(self):
        league = {"learner": 4, "champion": 3, "opponents": [{"version": 2, "wins": 0, "games": 8}]}
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
        self.assertTrue(all(job["current"] == "/unused/checkpoints/v000003" for job in jobs))
        self.assertTrue(all("v000004" not in job["opponent"] for job in jobs))
        self.assertTrue(
            all(
                job["opponent"] == "/unused/checkpoints/v000003"
                for job in jobs
                if job["selected"] is None and job["opponent"] != "scripted:defender"
            )
        )

    def test_an_optimizer_update_cannot_admit_an_unqualified_candidate_to_the_opponent_pool(self):
        league = {
            "learner": 1,
            "champion": 0,
            "episodes": [],
            "opponents": [{"version": 0, "wins": 0, "games": 0}],
        }
        learner = SimpleNamespace(
            train=lambda *args, **kwargs: {"updated": True},
            save=lambda path, metadata: path.mkdir(parents=True),
        )
        control = SimpleNamespace(report=lambda row: None)
        with (
            tempfile.TemporaryDirectory() as directory,
            patch("clash_bot.arena.league.generation.replay_samples", return_value=[]),
            patch("clash_bot.arena.league.generation.store"),
        ):
            learn(control, Path(directory), league, {"id": "rules"}, learner, 2)
        self.assertEqual(league["learner"], 2)
        self.assertEqual(league["champion"], 0)
        self.assertEqual(league["opponents"], [{"version": 0, "wins": 0, "games": 0}])
