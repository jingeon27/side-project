"""Exercise spawn/package resolution without writing a training league."""

import os
import tempfile
import unittest
from pathlib import Path

from ..policy.network import Policy
from ..sim.rules import rules_identity
from .parallel import play_frozen_games
from .selfplay import live_setup, setup_for


@unittest.skipUnless(
    os.environ.get("RUN_ARENA_INTEGRATION") == "1", "optional native process integration"
)
class PackagedParallelTests(unittest.TestCase):
    def test_two_spawned_workers_complete_a_mirror_and_a_mixed_deck_game(self):
        with tempfile.TemporaryDirectory() as directory:
            rules = rules_identity()
            checkpoint = Path(directory) / "checkpoint"
            policy = Policy(metadata={"version": 0, "rulesID": rules["id"]})
            policy.save(checkpoint, {"role": "integration_fixture"})
            jobs = [
                {
                    "current": str(checkpoint),
                    "opponent": str(checkpoint),
                    "rulesID": rules["id"],
                    "id": f"package-smoke-{seat}",
                    "setup": setup,
                    "seat": seat,
                    "simulations": 2,
                    "depth": 2,
                }
                for seat, setup in (
                    (0, live_setup()),
                    (1, {**setup_for("package-smoke"), "decks": ["giant_beatdown", "bait"]}),
                )
            ]
            games = play_frozen_games(jobs, 2)
            self.assertEqual(len(games), 2)
            self.assertTrue(
                all(game["completed"] and game["rejectedCommands"] == 0 for game in games)
            )
            self.assertEqual([game["setup"] for game in games], [job["setup"] for job in jobs])
