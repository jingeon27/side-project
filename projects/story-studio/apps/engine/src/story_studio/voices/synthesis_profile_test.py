"""A calibration cannot silently migrate to another checkpoint or alter other voices."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import wave

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
            self.assertIsNone(profile.reference)
            (folder / 'synthesis-speaker.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, '변경'):
                read_synthesis_profile(root, RUN)

    def test_reference_profile_binds_a_complete_local_waveform_and_its_transcript(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, original = fixture(root)
            audio = folder / 'synthesis-reference.wav'
            with wave.open(str(audio), 'wb') as recording:
                recording.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
                recording.writeframes(b'\x00\x04' * 72000)
            value = {**original, 'version': 2, 'predictorStrength': 1.5, 'referenceSha256': hashlib.sha256(audio.read_bytes()).hexdigest(), 'referenceText': '원래 말투를 참고하는 대사입니다.'}
            (folder / 'synthesis.json').write_text(json.dumps(value))
            profile = read_synthesis_profile(root, RUN)
            self.assertEqual(profile.reference.audio, audio)
            self.assertEqual(profile.reference.text, value['referenceText'])
            self.assertEqual(profile.predictor_strength, 1.5)
            for changes in [
                {'referenceSha256': '0' * 64}, {'referenceText': ''},
                {'referenceText': 42}, {'referenceText': '아' * 1001},
                {'referenceFile': '../../outside.wav'},
                {'predictorStrength': 1.51},
            ]:
                with self.subTest(changes=changes):
                    (folder / 'synthesis.json').write_text(json.dumps({**value, **changes}))
                    with self.assertRaises(ValueError):
                        read_synthesis_profile(root, RUN)

    def test_rejects_wrong_reference_format_and_truncated_audio_even_with_matching_hash(self):
        for rate, channels, width, length, truncated in [
            (16000, 1, 2, 3, False), (24000, 2, 2, 3, False),
            (24000, 1, 1, 3, False), (24000, 1, 2, 2, False),
            (24000, 1, 2, 3, True),
        ]:
            with self.subTest(rate=rate, channels=channels, width=width, length=length, truncated=truncated), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                folder, original = fixture(root)
                audio = folder / 'synthesis-reference.wav'
                with wave.open(str(audio), 'wb') as recording:
                    recording.setparams((channels, width, rate, 0, 'NONE', 'not compressed'))
                    recording.writeframes(b'\0' * rate * length * channels * width)
                if truncated:
                    audio.write_bytes(audio.read_bytes()[:-200])
                value = {**original, 'version': 2, 'referenceSha256': hashlib.sha256(audio.read_bytes()).hexdigest(), 'referenceText': '말투 기준 대사입니다.'}
                (folder / 'synthesis.json').write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    read_synthesis_profile(root, RUN)

    def test_rejects_checkpoint_changes_invalid_numbers_and_unknown_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder, original = fixture(root)
            for changes in [
                {'datasetHash': 'b' * 64}, {'runId': 'another-run'},
                {'talkerStrength': True}, {'talkerStrength': float('nan')},
                {'predictorStrength': 0}, {'predictorStrength': 1.5}, {'seed': True},
                {'speakerFile': '../../outside.safetensors'},
            ]:
                with self.subTest(changes=changes):
                    (folder / 'synthesis.json').write_text(json.dumps({**original, **changes}))
                    with self.assertRaises(ValueError):
                        read_synthesis_profile(root, RUN)


if __name__ == '__main__':
    unittest.main()
