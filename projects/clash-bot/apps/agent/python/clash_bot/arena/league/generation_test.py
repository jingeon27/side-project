import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from clash_bot.arena.league.generation import learn, scheduled
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARDS, DECKS, LIVE_DECK
from clash_bot.arena.training.deck_practice import open_practice, practice_orders, schedule_deck


class TrainingOpponentsTest(unittest.TestCase):
    def test_pool_rotation_reaches_every_deck_and_opens_with_its_lead_card_affordable(self):
        covered = set()
        for index in range(len(DECKS) - 1):
            seat = index % 2
            setup = schedule_deck({}, index, seat)
            deck = setup["practiceDeck"]
            self.assertEqual(setup["decks"][1 - seat], LIVE_DECK)
            covered.add(deck)
            orders = practice_orders(setup, seat, f"round-{index}")
            arena = Arena(index, orders, setup["decks"])
            self.assertGreater(open_practice(arena, setup, True), 0)
            lead = CARDS.index(setup["practiceLead"])
            self.assertIn(lead, arena.initial_hands[seat], CARDS[lead])
            self.assertIn(
                lead, [row[0] for row in arena.observe(seat)["legalActions"]], CARDS[lead]
            )
            self.assertEqual(arena.history, [])
        self.assertEqual(covered | {LIVE_DECK}, set(DECKS))

    def test_pressure_curriculum_uses_a_quarter_without_updating_the_qualified_pool(self):
        league = {"learner": 4, "champion": 3, "opponents": [{"version": 2, "wins": 0, "games": 8}]}
        jobs = scheduled(
            Path("/unused"),
            league,
            {"id": "rules"},
            5,
            range(16),
            {"games": 16, "simulations": 16, "depth": 6},
            np.random.default_rng(7),
        )
        scripted = [job for job in jobs if job["opponent"] is None]
        self.assertEqual(len(scripted), 4)
        self.assertEqual({job["seat"] for job in scripted}, {0, 1})
        self.assertTrue(all(job["selected"] is None for job in scripted))
        self.assertEqual(len({job["setup"]["pressure"] for job in scripted}), 4)
        self.assertEqual({job["setup"]["pressureRight"] for job in scripted}, {True, False})
        self.assertTrue(
            all(job["setup"]["decks"][job["seat"]] == "counterpush" for job in scripted)
        )
        self.assertEqual(sum(job["selected"] == 2 for job in jobs), 4)
        practice = [
            job
            for job in jobs
            if "practiceDeck" in job["setup"] and not job["setup"].get("offensePractice")
        ]
        self.assertEqual(len(practice), 4)
        funded = [job for job in jobs if job["setup"].get("offensePractice")]
        self.assertEqual([job["setup"]["practiceLead"] for job in funded], ["Graveyard"] * 2)
        mirrors = [job for job in jobs if job["collector"] is not None]
        self.assertEqual(len(mirrors), 4)
        self.assertEqual({job["seat"] for job in mirrors}, {0, 1})
        self.assertTrue(all(job["setup"]["decks"] == [LIVE_DECK, LIVE_DECK] for job in mirrors))
        self.assertTrue(all(job["collector"] == "/unused/checkpoints/v000004" for job in mirrors))
        self.assertTrue(all(job["labelReference"] == "/unused/checkpoints/v000004" for job in jobs))
        self.assertTrue(
            all(
                job["setup"]["decks"][job["seat"]] == job["setup"]["practiceDeck"]
                for job in practice
            )
        )
        self.assertTrue(all(job["current"] == "/unused/checkpoints/v000003" for job in jobs))
        self.assertTrue(all("v000004" not in job["opponent"] for job in jobs if job["opponent"]))
        self.assertTrue(
            all(
                job["opponent"] == "/unused/checkpoints/v000003"
                for job in jobs
                if job["selected"] is None and job["opponent"] is not None
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
