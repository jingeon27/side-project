import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from clash_bot.arena.league.generation import learn, scheduled
from clash_bot.arena.sim.engine import Arena
from clash_bot.arena.sim.rules import CARD_ID, CARDS, DECKS, FIELDS, LIVE_DECK, TILE, canonical
from clash_bot.arena.training.coverage import card_coverage
from clash_bot.arena.training.deck_practice import open_practice, practice_orders, schedule_deck


class TrainingOpponentsTest(unittest.TestCase):
    def test_funded_attacks_alternate_seats_and_prepare_a_real_tank_without_crediting_its_play(
        self,
    ):
        league = {"learner": 0, "champion": 0, "opponents": [{"version": 0, "wins": 0, "games": 0}]}
        setups = set()
        lanes = set()
        for version in range(1, 16, 2):
            [job] = scheduled(
                Path("/unused"),
                league,
                {"id": "r"},
                version,
                [2],
                {"games": 4, "simulations": 16, "depth": 8},
                np.random.default_rng(version),
            )
            setup, seat = job["setup"], job["seat"]
            opening = setup["offenseOpening"]
            setups.add((seat, opening["knight"]))
            orders = practice_orders(setup, seat, job["id"])
            arena = Arena(version, orders, setup["decks"], setup["delays"], setup["levels"])
            tick = open_practice(arena, setup, True)
            player = arena.state()["players"][seat]
            self.assertIn(CARD_ID["Graveyard"], player["hand"])
            self.assertGreaterEqual(player["elixir_milli"], 8000)
            if opening["knight"]:
                units = [
                    e
                    for e in arena.state()["entities"]
                    if e[FIELDS["team"]] == seat
                    and e[FIELDS["tower_slot"]] < 0
                    and e[FIELDS["card_id"]] == CARD_ID["Knight"]
                ]
                self.assertEqual(len(units), 1)
                x, y = canonical(units[0][FIELDS["x"]] / TILE, units[0][FIELDS["y"]] / TILE, seat)
                self.assertGreaterEqual(y, 17)
                lanes.add((seat, x > 9))
                self.assertEqual(x > 9, opening["right"])
            recorded = card_coverage(
                [
                    {
                        "setup": setup,
                        "samples": [],
                        "publicHistory": arena.history,
                        "trainingStartTick": tick,
                        "policies": [{}, {}],
                    }
                ]
            )
            self.assertEqual(recorded["cards"]["Knight"]["executed"], 0)
        self.assertEqual(setups, {(s, k) for s in (0, 1) for k in (False, True)})
        self.assertEqual(lanes, {(s, r) for s in (0, 1) for r in (False, True)})

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
