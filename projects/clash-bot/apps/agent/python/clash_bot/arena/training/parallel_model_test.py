"""Exercise spawn/package resolution without writing a training league."""

import os
import signal
import tempfile
import unittest
from pathlib import Path

from ..policy.network import Policy
from ..sim.rules import rules_identity
from .activity import opening_audit
from .evaluation import evaluate
from .parallel import Workers, play_frozen_game, play_frozen_pair
from .selfplay import setup_for


def interrupt_ignored(_job):
    return signal.getsignal(signal.SIGINT) is signal.SIG_IGN


@unittest.skipUnless(
    os.environ.get("RUN_ARENA_INTEGRATION") == "1", "optional native process integration"
)
class PackagedParallelTests(unittest.TestCase):
    def test_frozen_self_openings_start_without_forcing_a_card_or_training(self):
        with tempfile.TemporaryDirectory() as directory, Workers(2) as workers:
            rules = rules_identity()["id"]
            checkpoint = Path(directory) / "candidate"
            policy = Policy(metadata={"version": 0, "rulesID": rules})
            policy.save(checkpoint, {"role": "integration_fixture"})
            before = policy.checksum()
            result = opening_audit(
                0,
                play_pairs=lambda jobs: workers.map(
                    play_frozen_pair,
                    [
                        {
                            **job,
                            "rulesID": rules,
                            "challenger": str(checkpoint),
                            "champion": str(checkpoint),
                        }
                        for job in jobs
                    ],
                ),
                batch=2,
            )
            self.assertTrue(result["passed"])
            self.assertEqual(result["noPlayGames"], 0)
            self.assertEqual(len(result["games"]), 4)
            self.assertEqual(Policy.load(checkpoint, rules).checksum(), before)

    def test_spawned_workers_complete_matchups_covering_every_pool_deck(self):
        with tempfile.TemporaryDirectory() as directory, Workers(2) as workers:
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
            # The same two processes serve every batch.
            games = [
                game
                for index in range(0, len(jobs), 2)
                for game in workers.map(play_frozen_game, jobs[index : index + 2])
            ]
            self.assertEqual(len(games), 6)
            self.assertTrue(
                all(game["completed"] and game["rejectedCommands"] == 0 for game in games)
            )
            self.assertEqual([game["setup"] for game in games], [job["setup"] for job in jobs])
            self.assertEqual(workers.map(interrupt_ignored, [0, 1]), [True, True])

    def test_evaluation_in_workers_equals_the_same_evaluation_played_in_order(self):
        with tempfile.TemporaryDirectory() as directory, Workers(2) as workers:
            rules = rules_identity()["id"]
            policies, frozen = [], {"rulesID": rules}
            for role, seed in (("challenger", 3), ("champion", 4)):
                policy = Policy(seed=seed, metadata={"version": seed, "rulesID": rules})
                policy.save(Path(directory) / role, {"role": "integration_fixture"})
                policies.append(policy)
                frozen[role] = str(Path(directory) / role)
            in_order = evaluate(*policies, rules, 0, pairs=2)
            pooled = evaluate(
                *policies,
                rules,
                0,
                pairs=2,
                play_pairs=lambda jobs: workers.map(
                    play_frozen_pair, [{**job, **frozen} for job in jobs]
                ),
                batch=2,
            )

            def timeless(result):
                games = [
                    {key: value for key, value in game.items() if key != "elapsedSeconds"}
                    for game in result["games"]
                ]
                return {**result, "games": games}

            self.assertEqual(len(pooled["games"]), 4)
            self.assertEqual(timeless(pooled), timeless(in_order))
