import json
import tempfile
import unittest
from pathlib import Path

from clash_bot.files import atomic_json


class AtomicJsonTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def test_replaces_the_pointer_without_leaving_a_temporary_file(self):
        path = self.root / "champion/current.json"
        atomic_json(path, {"version": 1})
        atomic_json(path, {"version": 2, "reason": "검증 통과"})
        self.assertEqual(json.loads(path.read_text()), {"version": 2, "reason": "검증 통과"})
        self.assertEqual([child.name for child in path.parent.iterdir()], ["current.json"])

    def test_keeps_the_previous_pointer_when_the_new_value_cannot_be_written(self):
        path = self.root / "current.json"
        atomic_json(path, {"version": 1})
        with self.assertRaises(TypeError):
            atomic_json(path, {"version": object()})
        self.assertEqual(json.loads(path.read_text()), {"version": 1})
        self.assertEqual([child.name for child in self.root.iterdir()], ["current.json"])


if __name__ == "__main__":
    unittest.main()
