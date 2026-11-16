"""A calibrated voice checks every text segment locally before exporting audio."""
import gc
import json
from dataclasses import replace
from pathlib import Path
import sys
import tempfile

from .speech_quality import normalized_text, speech_segments, transcript_matches


class IncompleteSpeechError(ValueError):
    pass


def _segment_audio(model, text, profile):
    import numpy as np
    options = {'voice': 'studio_voice'} if profile.reference is None else {
        'ref_audio': str(profile.reference.audio), 'ref_text': profile.reference.text,
    }
    chunks = []
    for result in model.generate(
        text=text, lang_code='Korean', temperature=profile.temperature, **options,
        max_tokens=1024, split_pattern='', verbose=False,
    ):
        if result.token_count >= 1024:
            raise IncompleteSpeechError('대사 생성이 반복되어 다시 확인합니다')
        if result.sample_rate != 24000:
            raise ValueError('지원하지 않는 음성 샘플레이트입니다')
        chunks.append(np.asarray(result.audio))
    if not chunks:
        raise IncompleteSpeechError('음성 모델이 소리를 반환하지 않았습니다')
    audio = np.concatenate(chunks)
    if not audio.size or not np.isfinite(audio).all() or np.abs(audio).max() < .0001:
        raise IncompleteSpeechError('생성한 음성이 비어 있습니다')
    return audio


def synthesize_verified(root, run_id, profile, text, progress):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.stt.utils import load_model as load_recognizer
    from ..voices.jobs import load_trained
    from ..voices.synthesis_profile import apply_synthesis_profile

    parts = speech_segments(text)
    if not parts or not normalized_text(text):
        raise ValueError('읽을 대사가 없습니다')
    clips = {}
    mx.set_memory_limit(20 * 1024**3)
    pending = list(range(len(parts)))
    attempts = 3 if profile.reference is not None and profile.predictor_strength > 1 else 2
    with tempfile.TemporaryDirectory(prefix='voice-check-', dir=root / 'local') as temporary:
        folder = Path(temporary)
        for attempt in range(attempts):
            fallback = attempt == 2
            progress('누락된 대사를 안정적인 설정으로 만드는 중' if fallback else '한국어 목소리를 만드는 중' if attempt == 0 else '누락된 대사를 다시 생성하는 중')
            candidates = {}
            model = load_trained(root, run_id)
            try:
                # Strong voice detail can suppress words. After both sampled
                # attempts fail, keep the same speaker/reference and retry only
                # pending segments at the checkpoint's original predictor scale.
                if fallback:
                    apply_synthesis_profile(model, replace(profile, predictor_strength=1))
                for index in pending:
                    mx.random.seed((profile.seed + index + (0 if fallback else attempt * 7011)) % 2**31)
                    try:
                        candidates[index] = _segment_audio(model, parts[index], profile)
                    except IncompleteSpeechError:
                        continue
            finally:
                del model
                gc.collect()
                mx.clear_cache()
                print(json.dumps({'voiceCheckStage': 'tts-released', 'attempt': attempt + 1, 'activeMemoryGiB': round(mx.get_active_memory() / 1024**3, 3)}), file=sys.stderr)

            # TTS weights are released before the ASR model is loaded; the worker
            # retains its existing GPU lock for the complete generate/check job.
            if candidates:
                progress('한국어 대사가 빠지지 않았는지 확인하는 중')
                recognizer = load_recognizer(profile.verifier)
                try:
                    for index, audio in candidates.items():
                        filename = folder / f'segment-{index}-attempt-{attempt}.wav'
                        sf.write(filename, audio, 24000, subtype='PCM_16')
                        result = recognizer.generate(
                            str(filename), language='Korean', temperature=0,
                            max_tokens=1024, repetition_penalty=1.1,
                        )
                        if transcript_matches(parts[index], result.text):
                            clips[index] = audio
                finally:
                    del recognizer
                    gc.collect()
                    mx.clear_cache()
                    print(json.dumps({'voiceCheckStage': 'asr-released', 'attempt': attempt + 1, 'activeMemoryGiB': round(mx.get_active_memory() / 1024**3, 3)}), file=sys.stderr)
            pending = [index for index in pending if index not in clips]
            if not pending:
                silence = np.zeros(round(24000 * .16), dtype='float32')
                return np.concatenate([
                    value for index in range(len(parts))
                    for value in ([silence, clips[index]] if index else [clips[index]])
                ])
    raise IncompleteSpeechError('대사 일부가 정확히 읽혔는지 확인하지 못했습니다. 기존 음성은 보존했습니다. 대사를 짧게 나눠 다시 시도해 주세요.')
