"""The committed card catalogue loads without the native engine and names what the screen names."""

import json
import unittest

from clash_bot.arena.catalogue import PATH, Catalogue, content_id, current

COUNTERPUSH = (
    "barbarian_barrel",
    "furnace",
    "goblin_hut",
    "graveyard",
    "ice_wizard",
    "knight",
    "poison",
    "skeletons",
)


class CardCatalogueTest(unittest.TestCase):
    def test_the_id_names_the_content_not_the_formatting(self):
        catalogue = current().catalogue
        self.assertEqual(content_id(catalogue), catalogue.id)
        reformatted = Catalogue.model_validate_json(json.dumps(json.loads(PATH.read_text())))
        self.assertEqual(content_id(reformatted), catalogue.id)
        changed = json.loads(PATH.read_text())
        changed["cards"]["knight"]["features"][0] = 0.9
        self.assertNotEqual(content_id(Catalogue.model_validate(changed)), catalogue.id)

    def test_counterpush_cards_and_their_bodies_have_vectors(self):
        lookup = current()
        engine = ("BarbLog", "FirespiritHut", "GoblinHut", "Graveyard", "IceWizard")
        engine += ("Knight", "Poison", "Skeletons")
        self.assertEqual(tuple(lookup.card_name(name) for name in engine), COUNTERPUSH)
        units = lookup.catalogue.units
        # The engine's Furnace record is Furnace_rework; the old pattern match read it as "?".
        self.assertEqual(units["Furnace_rework"], "furnace")
        self.assertEqual(units["FireSpirits"], "fire_spirit")
        self.assertEqual(units["Graveyard_rework_Skeleton"], "skeleton")
        self.assertEqual((units["Knight_EV1"], units["IceWizardHero"]), ("knight", "ice_wizard"))
        self.assertEqual(lookup.card("poison").placement, "area_spell")
        self.assertEqual(lookup.card("graveyard").placement, "spawn_spell")
        self.assertEqual(lookup.card("barbarian_barrel").placement, "rolling_spell")
        self.assertEqual(lookup.card("furnace").placement, "ranged_troop")
        self.assertEqual(lookup.card("knight").placement, "troop")
        self.assertEqual(lookup.card("goblin_hut").placement, "building")

    def test_only_lingering_areas_are_field_effects(self):
        lookup = current()
        self.assertTrue(lookup.lingering("poison") and lookup.lingering("graveyard"))
        self.assertFalse(lookup.lingering("barbarian_barrel") or lookup.lingering("fireball"))
        self.assertFalse(lookup.lingering("knight") or lookup.lingering("unknown"))
        self.assertEqual(lookup.body_vector("unseen_thing").tolist(), lookup.bodies["?"].tolist())


if __name__ == "__main__":
    unittest.main()
