"""The committed catalogue is exactly what the pinned engine table builds."""

import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.arena.catalogue import Catalogue, current
from clash_bot.arena.sim.card_checks import catalogue_deployments
from clash_bot.arena.tables.catalogue_build import build, write_contract


class CatalogueBuildTest(unittest.TestCase):
    def test_committed_catalogue_matches_the_pinned_engine_table(self):
        built = Catalogue.model_validate(build())
        # Regenerate with `arena catalogue` when the engine pin or the builder changes.
        self.assertEqual(built, current().catalogue)

    def test_regeneration_preserves_format_and_validates_new_table_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "contract.json"
            path.write_text('{"cards": ["Knight"]}\n')
            original = path.read_bytes()
            write_contract(path, {"cards": ["Knight"]})
            self.assertEqual(path.read_bytes(), original)
            write_contract(path, {"cards": ["Knight", "Giant"]})
            self.assertEqual(json.loads(path.read_bytes()), {"cards": ["Knight", "Giant"]})
        receipt = catalogue_deployments({"new_table_label": "Knight"})
        self.assertEqual(list(receipt["byCard"]), ["new_table_label"])
        self.assertTrue(receipt["passed"])


if __name__ == "__main__":
    unittest.main()
