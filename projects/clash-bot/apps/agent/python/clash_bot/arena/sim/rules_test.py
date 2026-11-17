"""The deck pool and the battle catalogue every arena game shares."""

import unittest
from unittest.mock import patch

from clash_bot.arena.sim.rules import CARDS, DECKS, LIVE_DECK, SPEC, deck_ids, rules_identity


class DeckPoolTest(unittest.TestCase):
    def test_the_live_deck_keeps_battle_ids_zero_to_seven(self):
        self.assertEqual(deck_ids(LIVE_DECK), list(range(8)))
        self.assertEqual(len(CARDS), len(set(CARDS)))
        self.assertTrue(all(card in CARDS for deck in DECKS.values() for card in deck.cards))

    def test_timing_and_observation_noise_change_the_rule_identity(self):
        initial = rules_identity()["id"]
        with patch.dict(SPEC, liveCommandDelayTicks=SPEC["liveCommandDelayTicks"] + 1):
            self.assertNotEqual(rules_identity()["id"], initial)
        changed = {**SPEC["selfplay"], "decisionTicks": SPEC["selfplay"]["decisionTicks"] + 1}
        with patch.dict(SPEC, selfplay=changed):
            self.assertNotEqual(rules_identity()["id"], initial)
        self.assertTrue({"GoblinDrill", "Firecracker", "Balloon", "Pekka"} <= set(CARDS))


if __name__ == "__main__":
    unittest.main()
