"""The deck pool and the battle catalogue every arena game shares."""

import unittest

from clash_bot.arena.sim.rules import CARDS, DECKS, LIVE_DECK, deck_ids


class DeckPoolTest(unittest.TestCase):
    def test_the_live_deck_keeps_battle_ids_zero_to_seven(self):
        self.assertEqual(deck_ids(LIVE_DECK), list(range(8)))
        self.assertEqual(len(CARDS), len(set(CARDS)))
        self.assertTrue(all(card in CARDS for deck in DECKS.values() for card in deck.cards))


if __name__ == "__main__":
    unittest.main()
