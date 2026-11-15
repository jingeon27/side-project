import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from search_data import load_search_targets


class SearchDataTest(unittest.TestCase):
    def write(self, directory):
        root = Path(directory)
        image = root / 'before.png'; image.write_bytes(b'public before image')
        row = {'id': 'game-1-t100', 'image': image.name, 'imageSHA256': hashlib.sha256(image.read_bytes()).hexdigest(),
               'rulesID': 'rules-a', 'terminalOutcome': 1, 'choices': [0, 1, 2], 'target': [.1, .8, .1],
               'search': {'source': 'public_history_information_set_puct', 'simulations': 16}, 'prompt': 'A B C'}
        data = {'format': 'clash-arena-qwen-search-v1', 'rulesID': 'rules-a', 'samples': [row],
                'source': 'local_native_selfplay_public_before_state', 'teacherQualifiedForRealGame': False}
        path = root / 'dataset.json'; path.write_text(json.dumps(data))
        return path, data

    def test_validates_before_image_rule_terminal_and_normalized_search_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            path, data = self.write(directory)
            self.assertEqual(load_search_targets(path)[0], data)
            for replacement in ({'target': [.1, .9, .9]}, {'terminalOutcome': None}, {'rulesID': 'rules-b'},
                                {'target': [float('nan'), 0, 0]}, {'image': '../before.png'}):
                invalid = {**data, 'samples': [{**data['samples'][0], **replacement}]}
                path.write_text(json.dumps(invalid))
                with self.assertRaises((ValueError, FileNotFoundError)):
                    load_search_targets(path)
            path.write_text(json.dumps(data))
            (path.parent / 'before.png').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'changed'):
                load_search_targets(path)


if __name__ == '__main__':
    unittest.main()
