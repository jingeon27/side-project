import json
import unittest

from clash_bot.arena.catalogue import current
from clash_bot.arena.sim.rules import CARDS, MATCHUP_DECKS, OMIT_OPENING, PRACTICE_DECKS, SPEC
from clash_bot.arena.tables.practice_pool import PATH, verified_pool
from clash_bot.arena.training.deck_practice import rotation, schedule_deck
from clash_bot.card_specs import engine_specs


class PracticePoolTest(unittest.TestCase):
    def test_low_ladder_level_keeps_champions_and_friendly_spell_targets_legal(self):
        from clash_bot.arena.sim.engine import Arena
        from clash_bot.arena.sim.rules import DECKS, FRIENDLY_SPELLS, MINIMUM_LEVELS, deck_ids

        name = next(n for n, d in DECKS.items() if "ArcherQueen" in d.cards)
        arena = Arena(91, [deck_ids(name)] * 2, [name] * 2, levels=[10, 10])
        self.assertEqual(arena.levels, [10, 10])
        self.assertEqual(MINIMUM_LEVELS["ArcherQueen"], 11)
        self.assertIn("Heal", FRIENDLY_SPELLS)
        self.assertNotIn("Graveyard", FRIENDLY_SPELLS)

    def test_every_verified_card_is_available_and_pool_is_reproducible(self):
        catalogue = current().catalogue.model_dump(mode="json")
        specs = engine_specs(catalogue)
        self.assertEqual(verified_pool(catalogue, specs, SPEC), json.loads(PATH.read_bytes()))
        self.assertEqual({c["engine"] for c in specs["cards"].values()}, set(CARDS))
        self.assertTrue(set(MATCHUP_DECKS).isdisjoint(PRACTICE_DECKS))
        self.assertEqual(specs["unlinkedBodies"], [])
        knight = specs["cards"]["knight"]["combat"]["base"]
        self.assertEqual((knight["aggroRangeTiles"], knight["attackRangeTiles"]), (5.5, 1.2))
        for index in range(8 * len(rotation())):
            self.assertNotIn(schedule_deck({}, index, 0)["practiceLead"], OMIT_OPENING)
