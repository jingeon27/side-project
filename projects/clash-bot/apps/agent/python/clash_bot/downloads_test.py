import hashlib
import tempfile
import unittest
from pathlib import Path

from clash_bot.downloads import download

CONTENT = b"pinned engine wheel"
SHA256 = hashlib.sha256(CONTENT).hexdigest()


class DownloadTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = self.root / "source.bin"
        self.source.write_bytes(CONTENT)

    def test_replaces_a_partial_download_and_keeps_a_verified_file(self):
        target = self.root / "vendor/engine.whl"
        target.parent.mkdir()
        target.write_bytes(CONTENT[:6])
        download(self.source.as_uri(), target, SHA256, len(CONTENT))
        self.assertEqual(target.read_bytes(), CONTENT)
        self.source.write_bytes(b"changed upstream")
        download(self.source.as_uri(), target, SHA256, len(CONTENT))
        self.assertEqual(target.read_bytes(), CONTENT)

    def test_refuses_an_unverified_download_without_leaving_a_file(self):
        target = self.root / "engine.whl"
        with self.assertRaises(ValueError):
            download(self.source.as_uri(), target, "0" * 64, len(CONTENT))
        with self.assertRaises(ValueError):
            download(self.source.as_uri(), target, SHA256, len(CONTENT) - 1)
        self.assertEqual([path.name for path in self.root.iterdir()], ["source.bin"])


if __name__ == "__main__":
    unittest.main()
