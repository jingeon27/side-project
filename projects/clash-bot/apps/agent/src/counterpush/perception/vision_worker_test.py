from pathlib import Path
import unittest

import numpy as np
from PIL import Image

from vision_worker import poison_rings, red_markers, graveyard_presence, input_guard


class PoisonOutlineTest(unittest.TestCase):
    def test_fast_input_guard_preserves_recorded_graveyard_warning_without_a_classifier(self):
        root=Path(__file__).parent.parent/'testing'
        self.assertGreaterEqual(max(input_guard({'image':str(root/'graveyard-already-active.png')})['graveyardPresence']),350)
        self.assertLess(max(input_guard({'image':str(root/'unit-badges.png')})['graveyardPresence']),350)

    def pixels(self, name):
        return np.asarray(Image.open(Path(__file__).parent.parent / 'testing' / (name + '.png')).convert('RGB'))

    def test_red_poison_outline_on_recorded_screen(self):
        rings = poison_rings(self.pixels('poison-red'))
        self.assertTrue(any(abs(ring['x'] - 278) < 10 and abs(ring['y'] - 398) < 10 for ring in rings))

    def test_crown_tint_and_own_preview_are_not_red_poison_outlines(self):
        for name in ('crown-flash', 'own-poison-preview'):
            with self.subTest(name=name):
                self.assertEqual(poison_rings(self.pixels(name)), [])

    def test_level_badge_survives_real_anti_aliasing_without_switching_teams(self):
        root = Path(__file__).parent.parent / 'references'
        red = [np.asarray(Image.open(path).convert('RGB')) for path in root.glob('red-11*.png')]
        blue = [np.asarray(Image.open(path).convert('RGB')) for path in root.glob('blue-11*.png')]
        pixels = self.pixels('unit-badges')
        found = red_markers(pixels, red, 'red')
        self.assertTrue(any(abs(point['x'] - 103) < 6 and abs(point['y'] - 145) < 6 for point in found))
        other = red_markers(pixels, blue, 'blue')
        self.assertFalse(any(abs(point['x'] - 103) < 6 and abs(point['y'] - 145) < 6 for point in other))

    def test_already_active_graveyard_is_not_absent_when_a_different_stone_appears(self):
        self.assertGreaterEqual(graveyard_presence(self.pixels('graveyard-already-active'), 337), 350)
        self.assertGreaterEqual(graveyard_presence(self.pixels('graveyard-purple'), 95), 350)
        self.assertLess(graveyard_presence(self.pixels('unit-badges'), 337), 350)


if __name__ == '__main__':
    unittest.main()
