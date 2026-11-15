"""Packaged code resolves assets from explicit data and example roots."""
from pathlib import Path
import tempfile
import unittest

from .assets import owned_asset


class AssetRootTests(unittest.TestCase):
    def test_examples_are_explicit_and_private_assets_take_precedence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'private'
            examples = Path(directory) / 'published'
            examples.mkdir()
            filename = '29edf583-4d34-4b0a-99e4-9f66bf1c6400.wav'
            url = '/api/assets/' + filename
            (examples / filename).write_bytes(b'example')
            self.assertEqual(owned_asset(root, url, 'wav', examples), examples / filename)
            (root / 'assets').mkdir(parents=True)
            (root / 'assets' / filename).write_bytes(b'private')
            self.assertEqual(owned_asset(root, url, 'wav', examples), root / 'assets' / filename)
            with self.assertRaises(ValueError):
                owned_asset(root, '/api/assets/../../private.wav', 'wav', examples)
            with self.assertRaises(ValueError):
                owned_asset(root, '/api/assets/' + filename, 'mp4', examples)


if __name__ == '__main__':
    unittest.main()
