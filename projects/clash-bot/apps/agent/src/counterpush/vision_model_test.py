import os
from pathlib import Path
import unittest

from vision_worker import VisionWorker


@unittest.skipUnless(os.environ.get('RUN_COUNTERPUSH_INTEGRATION') == '1', 'Optional local ONNX model integration')
class VisionModelTest(unittest.TestCase):
    def test_real_effects_and_spawned_units_keep_their_distinct_meanings(self):
        here = Path(__file__).resolve().parent
        worker = VisionWorker(here.parents[3] / '.data/counterpush/detector')
        for name in ('graveyard-purple', 'graveyard-already-active'):
            with self.subTest(name=name):
                scan = worker.scan({'image': str(here / 'testing' / (name + '.png'))})
                self.assertTrue(any(effect['card'] == 'graveyard' for effect in scan['effects']))
        poison = worker.scan({'image': str(here / 'testing/poison-red.png')})
        self.assertTrue(any(effect['card'] == 'poison' and effect['side'] == 'red' for effect in poison['effects']))
        units = worker.scan({'image': str(here / 'testing/unit-badges.png')})
        self.assertFalse(units['effects'])
        spirits = [unit for unit in units['spawnedUnits'] if unit['kind'] == 'fire_spirit']
        self.assertTrue(spirits)
        self.assertTrue(all(unit['card'] is None and unit['sourceCard'] == 'furnace' for unit in spirits))


if __name__ == '__main__':
    unittest.main()
