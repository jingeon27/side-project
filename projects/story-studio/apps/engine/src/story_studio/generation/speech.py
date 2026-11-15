"""Korean speech with preset or completed trained voices."""
import re
from ..assets import asset_path, asset_url


def generate_voice(root, request, progress):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    mx.set_cache_limit(256 * 1024**2)
    progress("한국어 음성 모델을 불러오는 중")
    settings = request.get('settings', {'kind': 'preset', 'speaker': 'sohee', 'style': 'calm'})
    text = re.sub(r"(?m)^[^\n:]{1,24}:\s*", "", request["text"]).strip()
    if settings['kind'] == 'trained':
        from ..voices.synthesis_profile import read_synthesis_profile
        profile = read_synthesis_profile(root, settings['runId'])
        if profile is not None:
            from .speech_quality import spoken_text
            from .verified_speech import synthesize_verified
            text = spoken_text(request['text'])
            audio = synthesize_verified(root, settings['runId'], profile, text, progress)
            path = asset_path(root, 'wav')
            sf.write(path, audio, 24000)
            return {'asset': asset_url(path), 'duration': round(len(audio) / 24000, 3)}
        from ..voices.jobs import load_trained
        model = load_trained(root, settings['runId'])
        voice = 'studio_voice'
        instruct = None
    else:
        model = load_model(root / "local/models/voice")
        voice = settings['speaker']
        instruct = {'calm': '차분하고 따뜻한 한국어 이야기 내레이션', 'neutral': '자연스럽고 또렷한 한국어 발음', 'bright': '밝고 활기찬 한국어 말투', 'firm': '단호하고 힘 있는 한국어 말투'}[settings['style']]
    progress("한국어 목소리를 만드는 중")
    chunks = []
    sample_rate = 24000
    for result in model.generate(text=text, voice=voice, lang_code="Korean",
                                 temperature=0.7 if settings['kind'] == 'trained' else None,
                                 instruct=instruct, max_tokens=4096,
                                 split_pattern=r"\n+", verbose=False):
        chunks.append(np.asarray(result.audio))
        sample_rate = result.sample_rate
    if not chunks:
        raise ValueError("음성 모델이 소리를 반환하지 않았습니다")
    audio = np.concatenate(chunks)
    if not np.isfinite(audio).all() or np.abs(audio).max() < 0.0001:
        raise ValueError("생성한 음성이 비어 있습니다")
    path = asset_path(root, "wav")
    sf.write(path, audio, sample_rate)
    return {"asset": asset_url(path), "duration": round(len(audio) / sample_rate, 3)}
