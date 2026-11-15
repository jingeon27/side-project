"""A calibration cannot silently migrate to another checkpoint or alter other voices."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from ..catalog import model_specs
from .synthesis_profile import read_synthesis_profile

RUN = 'local-29edf583-4d34-4b0a-99e4-9f66bf1c6400'


def fixture(root):
    folder = root / 'voice-training/runs' / RUN
    checkpoint = folder / 'checkpoints/step-000192'
    checkpoint.mkdir(parents=True)
    (folder / 'checkpoints/latest').write_text(checkpoint.name)
    state = {'datasetHash': 'a' * 64, 'modelRevision': model_specs()['voice-train']['revision']}
    (checkpoint / 'state.json').write_text(json.dumps(state))
    adapters = checkpoint / 'adapters.safetensors'
    speaker = folder / 'synthesis-speaker.safetensors'
    adapters.write_bytes(b'private adapter fixture')
    speaker.write_bytes(b'private speaker fixture')
    spec = model_specs()['voice-asr']
    verifier = root / 'local/models' / spec['directory']
    verifier.mkdir(parents=True)
    (verifier / 'config.json').write_text('{}')
    value = {'version': 1, 'runId': RUN, 'checkpoint': checkpoint.name, **state,
             'adaptersSha256': hashlib.sha256(adapters.read_bytes()).hexdigest(),
             'speakerSha256': hashlib.sha256(speaker.read_bytes()).hexdigest(),
             'verifierRevision': spec['revision'], 'talkerStrength': .75,
             'predictorStrength': 1, 'temperature': .7, 'seed': 1281}
    (folder / 'synthesis.json').write_text(json.dumps(value))
    return folder, value


class SynthesisProfileTests(unittest.TestCase):
    def test_other_runs_without_a_profile_keep_the_legacy_path(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(read_synthesis_profile(Path(directory), RUN))

    def test_binds_the_profile_to_actual_speaker_and_adapter_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, value = fixture(root)
            profile = read_synthesis_profile(root, RUN)
            self.assertEqual(profile.talker_strength, .75)
            (folder / 'synthesis-speaker.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, '변경'):
                read_synthesis_profile(root, RUN)

    def test_rejects_checkpoint_changes_invalid_numbers_and_unknown_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, original = fixture(root)
            for changes in [
                {'datasetHash': 'b' * 64}, {'runId': 'another-run'},
                {'talkerStrength': True}, {'talkerStrength': float('nan')},
                {'predictorStrength': 0}, {'seed': True},
                {'speakerFile': '../../outside.safetensors'},
            ]:
                with self.subTest(changes=changes):
                    (folder / 'synthesis.json').write_text(json.dumps({**original, **changes}))
                    with self.assertRaises(ValueError):
                        read_synthesis_profile(root, RUN)


if __name__ == '__main__':
    unittest.main()
