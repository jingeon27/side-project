"""The committed catalogue is exactly what the pinned engine table builds."""

import unittest

from clash_bot.arena.catalogue import Catalogue, current
from clash_bot.arena.catalogue_build import build


class CatalogueBuildTest(unittest.TestCase):
    def test_committed_catalogue_matches_the_pinned_engine_table(self):
        built = Catalogue.model_validate(build())
        # Regenerate with `arena catalogue` when the engine pin or the builder changes.
        self.assertEqual(built, current().catalogue)


if __name__ == "__main__":
    unittest.main()
