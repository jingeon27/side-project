"""Self-play pairs pool decks; only live-mirror games feed the Qwen studies."""

import unittest

from clash_bot.arena.engine import DECKS, LIVE_DECK
from clash_bot.arena.export import export
from clash_bot.arena.policy import Policy
from clash_bot.arena.selfplay import live_mirror, matchup, play_game


class DeckMatchupTest(unittest.TestCase):
    def test_matchups_are_seeded_by_game_and_half_are_the_live_mirror(self):
        games = [f"train-1-{index}" for index in range(400)]
        pairs = [matchup(game) for game in games]
        self.assertEqual(pairs, [matchup(game) for game in games])
        self.assertTrue(all(name in DECKS for pair in pairs for name in pair))
        mirrors = sum(pair == [LIVE_DECK, LIVE_DECK] for pair in pairs) / len(pairs)
        self.assertGreater(mirrors, 0.45)
        self.assertLess(mirrors, 0.65)
        self.assertGreater(len({tuple(pair) for pair in pairs}), 8)

    def test_a_mixed_deck_game_runs_and_stays_out_of_the_qwen_studies(self):
        policy = Policy(metadata={"version": 0, "rulesID": "rules-a"})
        game = play_game(
            [policy, policy],
            "mixed-contract",
            "rules-a",
            simulations=2,
            depth=2,
            max_ticks=240,
            decks=["bait", "hog_cycle"],
        )
        self.assertEqual(game["decks"], ["bait", "hog_cycle"])
        self.assertGreater(game["decisions"], 0)
        self.assertFalse(live_mirror(game))
        completed = {**game, "completed": True, "samples": [{"search": {"simulations": 8}}]}
        self.assertIsNone(export("/nonexistent", [completed]))


if __name__ == "__main__":
    unittest.main()
