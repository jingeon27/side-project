import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.arena.league.coverage import latest_evaluation
from clash_bot.arena.sim.rules import CARD_ID, LIVE_DECK


class EvaluationCoverageTest(unittest.TestCase):
    def test_mirror_receipts_follow_each_seat_and_skip_training_and_incomplete_records(self):
        knight, graveyard = CARD_ID["Knight"], CARD_ID["Graveyard"]
        game = {
            "setup": {"decks": [LIVE_DECK, LIVE_DECK]},
            "challengerSeat": 0,
            "publicHistory": [
                {
                    "plays": [
                        {"team": 0, "action": [-2, 0, 0]},
                        {"team": 1, "action": [knight, 0, 0]},
                    ]
                },
                {"plays": [{"team": 0, "action": [graveyard, 0, 0]}]},
            ],
        }
        record = {
            "rulesID": "same",
            "complete": True,
            "seedDomain": "holdout",
            "trainingGamesIncluded": False,
            "generation": 45,
            "champion": {"version": 0},
            "challenger": {"version": 4},
            "gate": {"passed": False},
            "matchupStrata": {"liveMirror": {"score": 0.5}},
            "games": [
                game,
                {**game, "challengerSeat": 1},
                {**game, "setup": {"decks": [LIVE_DECK, "bait"]}},
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            results = root / "evaluations"
            results.mkdir()
            self.assertIsNone(latest_evaluation(root, "same"))
            (results / "v000004-e000045.json").write_text(json.dumps(record))
            for i, change in enumerate(
                (
                    {"complete": False},
                    {"rulesID": "other"},
                    {"seedDomain": "training"},
                    {"trainingGamesIncluded": True},
                ),
                46,
            ):
                (results / f"v000008-e{i:06}.json").write_text(json.dumps({**record, **change}))
            snapshot = latest_evaluation(root, "same")

        self.assertEqual(
            (snapshot["evaluation"], snapshot["games"], snapshot["mirror"]["games"]), (45, 3, 2)
        )
        for role in ("champion", "challenger"):
            used = snapshot["mirror"]["executed"][role]
            self.assertEqual(
                (used["Knight"], used["Graveyard"], used["ability"], used["Poison"]), (1, 1, 1, 0)
            )
            self.assertEqual(
                snapshot["mirror"]["openingCards"][role], {"Knight": 1, "Graveyard": 1}
            )
