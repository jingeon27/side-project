"""Native array/worker-boundary checks; actual speech models are replaced by tiny fixtures."""
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import weakref

try:
    import mlx.core as mx
    import numpy as np
except ModuleNotFoundError as error:
    if error.name and error.name.startswith('mlx'):
        raise unittest.SkipTest('MLX array/lifecycle verification requires Apple Silicon') from error
    raise

from .speech_quality import speech_segments
from .verified_speech import IncompleteSpeechError, _segment_audio, synthesize_verified


class VerifiedSpeechTests(unittest.TestCase):
    def test_empty_decoder_output_is_recoverable(self):
        model = SimpleNamespace(generate=lambda **_: iter([SimpleNamespace(
            audio=np.empty(0), sample_rate=24000, token_count=0,
        )]))
        with self.assertRaises(IncompleteSpeechError):
            _segment_audio(model, '오늘도 고맙습니다.', .7)

    def exercise(self, root, always_incomplete):
        text = ('작은 고양이가 조용한 숲으로 갔어요. ' * 8) + '모두 편안한 밤 보내세요.'
        parts = speech_segments(text)
        self.assertEqual(len(parts), 2)
        tts_calls, asr_calls, voices, recognizers = [], [], [], []
        case = self

        class TinyVoice:
            def generate(self, **options):
                tts_calls.append(options['text'])
                yield SimpleNamespace(audio=np.full(9600, .1, dtype='float32'), sample_rate=24000, token_count=5)

        class TinyRecognizer:
            def generate(self, filename, **options):
                index = int(Path(filename).stem.split('-')[1])
                attempt = int(Path(filename).stem.split('-')[3])
                asr_calls.append((index, attempt))
                value = '빠진 대사' if always_incomplete or (index == 1 and attempt == 0) else parts[index]
                return SimpleNamespace(text=value)

        def load_voice(*args):
            case.assertTrue(all(reference() is None for reference in recognizers))
            model = TinyVoice()
            voices.append(weakref.ref(model))
            return model

        def load_recognizer(*args):
            case.assertTrue(all(reference() is None for reference in voices))
            model = TinyRecognizer()
            recognizers.append(weakref.ref(model))
            return model

        profile = SimpleNamespace(seed=1281, temperature=.7, verifier=root / 'asr')
        (root / 'local').mkdir()
        with patch('story_studio.voices.jobs.load_trained', side_effect=load_voice), patch('mlx_audio.stt.utils.load_model', side_effect=load_recognizer):
            if always_incomplete:
                with self.assertRaises(IncompleteSpeechError):
                    synthesize_verified(root, 'local-fixture', profile, text, lambda *_: None)
            else:
                audio = synthesize_verified(root, 'local-fixture', profile, text, lambda *_: None)
                self.assertEqual(len(audio), 9600 * 2 + round(24000 * .16))
                self.assertEqual(tts_calls, [*parts, parts[1]])
                self.assertEqual(asr_calls, [(0, 0), (1, 0), (1, 1)])
        self.assertTrue(all(reference() is None for reference in voices + recognizers))
        self.assertFalse(list((root / 'local').glob('voice-check-*')))
        self.assertFalse((root / 'assets').exists())
        return tts_calls

    def test_retries_only_missing_segments_and_releases_each_model_before_the_next(self):
        with tempfile.TemporaryDirectory() as directory:
            self.exercise(Path(directory), False)

    def test_rejects_incomplete_audio_after_the_bounded_retry_without_publishing_an_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = self.exercise(Path(directory), True)
            self.assertEqual(len(calls), 4)


if __name__ == '__main__':
    unittest.main()
