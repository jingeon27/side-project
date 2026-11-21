import unittest

from clash_bot.arena.sim.rules import CARDS
from clash_bot.arena.training.form_usage import count_form_plays, form_counts


class FormUsageTest(unittest.TestCase):
    def test_only_native_successful_plays_count_and_ability_is_attributed_to_its_owner(self):
        knight, wizard = CARDS.index("Knight"), CARDS.index("IceWizard")
        blue = {
            "deck": [wizard, knight],
            "forms": [2, 1],
            "abilities": [[1, 0, 2, wizard, 0]],
            "evo": [[knight, 2, 1, 2]],
        }
        before = {"players": [blue]}
        after = {"players": [{**blue, "evo": [[knight, 0, 0, 2]]}]}
        counts = form_counts()
        count_form_plays(counts, before, after, [], {0})
        self.assertTrue(all(not values for values in counts.values()))
        events = [{"plays": [{"team": 0, "action": [card, 0, 0]} for card in (knight, wizard, -2)]}]
        events.append({"plays": [{"team": 1, "action": [-2, 0, 0]}]})
        count_form_plays(counts, before, after, events, {0})
        self.assertEqual(
            counts,
            {
                "heroDeployments": {"IceWizard": 1},
                "abilityUses": {"IceWizard": 1},
                "evolvedDeployments": {"Knight": 1},
            },
        )
