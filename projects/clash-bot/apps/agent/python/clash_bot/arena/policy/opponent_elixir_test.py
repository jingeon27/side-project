"""The simulator bounds the opponent's elixir with the live ledger's own arithmetic."""

import json
import unittest

from clash_bot.arena.policy.opponent_elixir import OpponentElixir
from clash_bot.paths import FIXTURES_DIR


class LiveLedgerTest(unittest.TestCase):
    def test_the_bound_is_the_live_ledgers_for_the_shared_cases(self):
        cases = json.loads((FIXTURES_DIR / "opponent-elixir-cases.json").read_text())["cases"]
        self.assertGreaterEqual(len(cases), 4)
        for case in cases:
            first, *later = case["samples"]
            bound = OpponentElixir(first["at"] / 1000, first["amount"])
            with self.subTest(case=case["name"]):
                self.assertAlmostEqual(bound.upper, first["max"], places=9)
                for sample in later:
                    upper = bound.sample(
                        sample["at"] / 1000,
                        sample["amount"],
                        sum(play["cost"] for play in sample["own"]),
                        sum(play["cost"] for play in sample["opponent"]),
                    )
                    self.assertAlmostEqual(upper, sample["max"], places=9)

    def test_an_unrecognized_play_keeps_the_bound_high_and_a_full_bar_assumes_the_fastest_gain(
        self,
    ):
        seen, unseen = OpponentElixir(0, 5), OpponentElixir(0, 5)
        for second in range(1, 5):
            amount = 5 + second / 2.8
            seen.sample(second, amount, 0, 4 if second == 2 else 0)
            unseen.sample(second, amount, 0, 0)
        self.assertAlmostEqual(unseen.upper - seen.upper, 4)
        full = OpponentElixir(0, 10)
        self.assertAlmostEqual(full.sample(1, 10, 0, 6) - (10 - 6), 3 / 2.8)


if __name__ == "__main__":
    unittest.main()
