import hashlib
from pathlib import Path
import tempfile
import unittest

from clash_bot.qwen.model_specs import verify_model


class ModelFilesTest(unittest.TestCase):
    def test_verifies_every_shard_and_rejects_modified_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            files = {f'model-{i}.safetensors': str(i).encode() for i in range(3)}
            spec = {'files': {name: hashlib.sha256(value).hexdigest() for name, value in files.items()}}
            for name, value in files.items():
                (Path(directory) / name).write_bytes(value)
            verify_model(directory, spec)
            (Path(directory) / 'model-2.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'model-2'):
                verify_model(directory, spec)
