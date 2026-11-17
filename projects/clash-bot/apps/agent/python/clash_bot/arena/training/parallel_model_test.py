"""Exercise spawn/package resolution without writing a training league."""

import os
import tempfile
import unittest
from pathlib import Path

from ..policy.network import Policy
from ..sim.rules import rules_identity
from .parallel import play_frozen_games
from .selfplay import setup_for


@unittest.skipUnless(
    os.environ.get("RUN_ARENA_INTEGRATION") == "1", "optional native process integration"
)
class PackagedParallelTests(unittest.TestCase):
    def test_spawned_workers_complete_matchups_covering_every_pool_deck(self):
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
                    "id": f"package-smoke-{index}",
                    "setup": {**setup_for(f"package-smoke-{index}"), "decks": decks},
                    "seat": index % 2,
                    "simulations": 2,
                    "depth": 2,
                }
                for index, decks in enumerate(
                    (
                        ["counterpush", "drill_control"],
                        ["giant_beatdown", "bait"],
                        ["golem", "lava_balloon"],
                        ["pekka_bridge", "royal_giant"],
                        ["hog_cycle", "hog_firecracker"],
                        ["xbow_cycle", "giant_graveyard"],
                    )
                )
            ]
            games = [
                game
                for index in range(0, len(jobs), 2)
                for game in play_frozen_games(jobs[index : index + 2], 2)
            ]
            self.assertEqual(len(games), 6)
            self.assertTrue(
                all(game["completed"] and game["rejectedCommands"] == 0 for game in games)
            )
            self.assertEqual([game["setup"] for game in games], [job["setup"] for job in jobs])
