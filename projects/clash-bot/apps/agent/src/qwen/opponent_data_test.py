import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from opponent_data import DEMONSTRATION_FORMAT, load_demonstrations


class OpponentDataTest(unittest.TestCase):
    def fixture(self, directory, **overrides):
        directory = Path(directory)
        (directory / 'images').mkdir(exist_ok=True)
        (directory / 'images/before.png').write_bytes(b'before')
        (directory / 'images/after.png').write_bytes(b'after')
        sample = {'id': 'furnace', 'actor': 'red_top', 'verified_actor': True, 'absent_before': True,
                  'confidence': 0.95, 'hand': None, 'elixir': None, 'exact_target': None,
                  'evidence': 'new_unit_visible', 'before_seconds': 165, 'after_seconds': 161,
                  'image': 'images/before.png', 'image_sha256': hashlib.sha256(b'before').hexdigest(),
                  'evidence_image': 'images/after.png', 'evidence_sha256': hashlib.sha256(b'after').hexdigest(),
                  'choices': [0, 1], 'target_ids': [1], 'card': 'furnace', 'lane': 'left',
                  'candidates': [{'id': 0, 'card': None, 'target': {'x': 0}},
                                 {'id': 1, 'card': 'furnace', 'target': {'x': 95}}], **overrides}
        path = directory / 'dataset.json'
        path.write_text(json.dumps({'format': DEMONSTRATION_FORMAT, 'source': 'counterpush_live_screen', 'samples': [sample]}))
        return path

    def test_validates_evidence_hashes_and_rejects_changed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.fixture(directory)
            dataset, identity, _ = load_demonstrations(path)
            self.assertEqual(len(dataset['samples']), 1)
            self.assertEqual(len(identity), 64)
            (Path(directory) / 'images/after.png').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                load_demonstrations(path)

    def test_rejects_hidden_state_guesses_wrong_actor_and_label_mismatches(self):
        with tempfile.TemporaryDirectory() as directory:
            for overrides in ({'elixir': 8}, {'verified_actor': False}, {'target_ids': [0]},
                              {'confidence': 0.8}, {'after_seconds': 100}, {'image': '../outside.png'}):
                with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                    load_demonstrations(self.fixture(directory, **overrides))


if __name__ == '__main__':
    unittest.main()
