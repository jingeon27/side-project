import unittest

from clash_bot.arena.training.activity import opening_audit


class OpeningAuditTest(unittest.TestCase):
    def test_waiting_forever_or_only_pressing_the_ability_cannot_pass(self):
        for plays in ([], [{"action": [-2, 0, 0]}]):

            def play(jobs):
                return [
                    [
                        {
                            "completed": True,
                            "rejectedCommands": 0,
                            "publicHistory": [{"tick": 100, "plays": plays}],
                        }
                    ]
                    * 2
                    for job in jobs
                ]

            result = opening_audit(3, play, batch=2)
            self.assertFalse(result["passed"])
            self.assertEqual(result["noPlayGames"], 4)
            self.assertFalse(result["trainingGamesIncluded"])

    def test_waiting_to_save_then_starting_is_allowed_and_uses_disjoint_frozen_jobs(self):
        asked = []

        def play(jobs):
            asked.extend(jobs)
            return [
                [
                    {
                        "completed": True,
                        "rejectedCommands": 0,
                        "publicHistory": [{"tick": 600, "plays": [{"action": [5, 1000, 2000]}]}],
                    }
                ]
                * 2
                for job in jobs
            ]

        result = opening_audit(7, play, batch=2)
        self.assertTrue(result["passed"])
        self.assertEqual(result["firstCardTicks"], [600] * 4)
        self.assertTrue(all(job["identity"].startswith("opening-holdout-7-") for job in asked))
        self.assertEqual(asked[0]["setup"]["decks"], ["counterpush", "counterpush"])

    def test_interruption_is_not_success(self):
        result = opening_audit(1, lambda jobs: [], should_stop=lambda: True)
        self.assertFalse(result["passed"])
        self.assertFalse(result["complete"])


if __name__ == "__main__":
    unittest.main()
