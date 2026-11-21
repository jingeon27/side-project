import unittest


class NativeReplayTest(unittest.TestCase):
    def test_goblin_rocket_silo_search_copy_preserves_full_native_save(self):
        from .candidates import legal_actions
        from .engine import Arena, Record
        from .rules import CARD_ID, DECKS, LIVE_DECK, Action, deck_ids

        card = CARD_ID["GoblinRocketSilo"]
        deck = next(n for n, v in DECKS.items() if "GoblinRocketSilo" in v.cards)
        own = [card, *[other for other in deck_ids(deck) if other != card]]
        world = Arena(773, [own, deck_ids(LIVE_DECK)], [deck, LIVE_DECK])
        world.play([Action(-1)] * 2, 300)
        action = next(a for a in legal_actions(world.battle, 0, world.state()) if a.card == card)
        world.play([action, Action(-1)], 3)
        saved, record = world.battle.save(), Record(world)
        world.play([Action(-1)] * 2, 9)
        fork = Arena(19).adopt(saved, record)
        self.assertEqual(fork.battle.save(), saved)
        fork.play([Action(-1)] * 2, 9)
        self.assertEqual(fork.battle.save(), world.battle.save())
