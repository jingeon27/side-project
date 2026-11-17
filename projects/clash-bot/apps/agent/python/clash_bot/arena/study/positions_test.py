import copy
import unittest

from clash_bot.arena.study.positions import balanced_positions


def episodes():
    return [
        {
            "gameID": f"game-{game}",
            "winner": game % 2,
            "samples": [
                {
                    "observation": {
                        "team": 0,
                        "state": {
                            "tick": (index // 3) * 200,
                            "players": [
                                {
                                    "hand": [offset + card for card in range(4)],
                                    "hand_costs": [5, 3, 4, 1],
                                    "elixir_milli": 2000 if index < 9 else 10000,
                                }
                            ],
                        },
                    },
                }
                for index in range(54)
            ],
        }
        for game, offset in enumerate((0, 4, 0, 4))
    ]


class BalancedPositionsTest(unittest.TestCase):
    def test_samples_affordable_cards_across_games_and_later_positions(self):
        rows = balanced_positions(episodes(), 8)
        self.assertEqual({row["focusCard"] for row in rows}, set(range(8)))
        self.assertEqual(len({row["gameID"] for row in rows}), 4)
        self.assertGreater(len({row["stage"] for row in rows}), 1)
        for row in rows:
            own = row["sample"]["observation"]["state"]["players"][0]
            slot = own["hand"].index(row["focusCard"])
            self.assertLessEqual(own["hand_costs"][slot] * 1000, own["elixir_milli"])

    def test_deterministic_no_duplicates_and_no_future_outcome_selection(self):
        before = episodes()
        changed = copy.deepcopy(before)
        for row in changed:
            row["winner"] = 2
        result = balanced_positions(before, 32)
        self.assertEqual(result, balanced_positions(changed, 32))
        keys = [(row["gameID"], row["sample"]["observation"]["state"]["tick"]) for row in result]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(balanced_positions([], 8), [])


if __name__ == "__main__":
    unittest.main()
