import tempfile
import unittest
from pathlib import Path

from ..policy.network import Policy
from ..sim.rules import LIVE_DECK, POOL_ATTACKS, POOL_DECKS, rules_identity
from ..training.parallel import play_frozen_game
from ..training.replay import replay_coverage, replay_samples
from ..training.storage import read_episode, replay_path, write_replay
from .champions import checkpoint, initialize
from .pool_play import deck_receipt, pool_jobs


class PoolPlayTest(unittest.TestCase):
    def test_resume_uses_committed_matches_and_rotates_each_attack_across_both_seats(self):
        root = Path("/unused")
        league = {"episodes": ["train-regular", "train-focus"], "champion": 2, "learner": 7}
        settings = {"poolGames": 4, "simulations": 16, "depth": 8}
        jobs = []
        while len(jobs) < 4 * len(POOL_DECKS):
            batch = pool_jobs(root, league, {"id": "rules"}, 8, settings)
            # Interrupt the first generation after two commits, then resume the other matches.
            consumed = batch[:2] if not jobs else batch
            league["episodes"].extend(str(root / (j["id"] + ".json.gz")) for j in consumed)
            jobs.extend(consumed)
        jobs = jobs[: 4 * len(POOL_DECKS)]
        seen = {deck: set() for deck in POOL_DECKS}
        for i, job in enumerate(jobs):
            seat, setup = job["seat"], job["setup"]
            deck = POOL_DECKS[i % len(POOL_DECKS)]
            self.assertEqual(setup["poolLearnerSeat"], seat)
            self.assertEqual((setup["decks"][seat], setup["decks"][1 - seat]), (deck, LIVE_DECK))
            self.assertEqual(setup["levels"][0], setup["levels"][1])
            self.assertEqual(
                set(setup),
                {"decks", "delays", "levels", "phase", "poolLearnerSeat", "poolAttackCard"},
            )
            self.assertEqual(
                (job["collector"], job["labelReference"]), (str(checkpoint(root, 7)),) * 2
            )
            self.assertEqual((job["current"], job["opponent"]), (str(checkpoint(root, 2)),) * 2)
            seen[deck].add((seat, setup["poolAttackCard"]))
        for deck, actual in seen.items():
            self.assertEqual(actual, {(s, card) for s in (0, 1) for card in POOL_ATTACKS[deck]})
        self.assertEqual(
            pool_jobs(root, league, {"id": "rules"}, 8, {**settings, "poolGames": 0}), []
        )

    def test_native_full_match_credits_only_learner_decisions_that_reach_the_optimizer(self):
        rules = rules_identity()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            league = initialize(root, rules)
            actor = Policy(seed=17, metadata={"rulesID": rules["id"], "version": 1})
            actor.save(checkpoint(root, 1), {"role": "test_learner"})
            league["learner"] = 1
            job = pool_jobs(root, league, rules, 2, {"poolGames": 1, "simulations": 2, "depth": 2})[
                0
            ]
            game = play_frozen_game({**job, "id": "train-pool-native-receipt"})
            receipt = deck_receipt(game)
            self.assertEqual(game["policies"][job["seat"]]["weightsSHA256"], actor.checksum())
            self.assertEqual(game["policies"][1 - job["seat"]]["version"], 0)
            self.assertGreater(receipt["deployments"], 0)
            self.assertGreater(receipt["labeledDecisions"], 0)
            self.assertEqual(receipt["labeledDecisions"], len(game["samples"]))
            self.assertTrue(
                all(
                    r["teacherVersion"] == 0 and r["referenceVersion"] == 1 for r in game["samples"]
                )
            )
            path = root / "episodes" / "full.json.gz"
            write_replay(path, game)
            rows = replay_samples([read_episode(replay_path(path))], rules["id"], max_samples=3)
            self.assertEqual(replay_coverage(rows)["directDeckRows"], {receipt["deck"]: len(rows)})
            self.assertLess(len(rows), receipt["labeledDecisions"])
            for invalid in (
                {"rejectedCommands": 1},
                {"completed": False},
                {"trainingStartTick": 20},
            ):
                with self.assertRaisesRegex(ValueError, "Invalid full-deck"):
                    deck_receipt({**game, **invalid})
            opponent_row = {**game["samples"][0], "team": 1 - job["seat"]}
            with self.assertRaisesRegex(ValueError, "acting learner"):
                deck_receipt({**game, "samples": [opponent_row]})
