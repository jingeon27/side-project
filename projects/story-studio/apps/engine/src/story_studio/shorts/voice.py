"""Read Korean shorts with locally designed voices and archived stock presets."""
from functools import lru_cache
import gc
import hashlib
import os
from pathlib import Path
import tempfile

from ..catalog import model_specs
from ..generation.speech import speech_samples
from ..setup import gpu_lock

SPEAKER = 'M2'
PRESENTER = 'sohee-playful'
CONVERSATION_VOICES = {'ko-casual-male', 'ko-casual-female', 'ko-comment-male'}
SPEAKERS = CONVERSATION_VOICES | {PRESENTER} | {f'{group}{i}' for group in ('M', 'F') for i in range(1, 6)}
STEPS = 12
PLAYFUL = ('웃긴 걸 발견하고 친구부터 부르는 한국인 진행자. 입꼬리를 올린 채 말이 톡톡 튀고, '
           '살짝 호들갑스러운 장난기가 있다. 한 호흡은 짧고 재빠르게, 질문은 쫑긋, '
           '숫자와 마지막 한마디는 또렷하게. 적힌 대사만 자연스럽게 말한다.')
TAKE_SEED = 136
TEMPERATURE = .68
# At 12 speech tokens per second, the full 30-second film fits before this ceiling.
PRESENTER_MAX_TOKENS = 512
DIFFUSION_STEPS = 12
GUIDANCE = 2.0
CONVERSATION_MAX_TOKENS = 512


def speaker_for(episode, shot):
    return 'recording' if 'recording' in shot else shot.get('speaker', episode.get('narrator', SPEAKER))


@lru_cache(maxsize=1)
def narrator(directory):
    try:
        from supertonic import TTS
    except ImportError as error:
        raise RuntimeError('shorts setup-voice로 한국어 내레이터를 먼저 준비하세요.') from error
    if not (directory / 'onnx/tts.json').is_file():
        raise RuntimeError('shorts setup-voice로 한국어 음성 모델을 준비하세요.')
    engine = TTS(model='supertonic-3', model_dir=directory, auto_download=False,
                 intra_op_num_threads=3, inter_op_num_threads=1)
    return engine


def save_take(dest, samples, rate):
    import soundfile as sf
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', dir=dest.parent, delete=False) as file:
        tmp = Path(file.name)
    try:
        sf.write(tmp, samples, rate, subtype='PCM_16')
        os.replace(tmp, dest)
    finally:
        tmp.unlink(missing_ok=True)
    return dest


def conversation_samples(model, text, reference):
    import numpy as np
    result = next(model.generate(text, ref_audio=str(reference), inference_timesteps=DIFFUSION_STEPS,
                                 cfg_value=GUIDANCE, max_tokens=CONVERSATION_MAX_TOKENS), None)
    if result is None or result.token_count >= CONVERSATION_MAX_TOKENS:
        raise ValueError('한 호흡에 읽을 수 있게 대사를 줄이거나 다른 테이크로 읽어 주세요.')
    samples = np.asarray(result.audio).reshape(-1)
    if not samples.size or not np.isfinite(samples).all() or np.abs(samples).max() < .001:
        raise ValueError('내레이션에서 유효한 신호를 찾지 못했습니다.')
    return samples, result.sample_rate


def mlx_take(data, folder, dest, text, reference, seed):
    if not (folder / 'model.safetensors').is_file():
        raise RuntimeError('shorts setup-voice로 한국어 음성을 준비하세요.')
    with gpu_lock(data / 'local'):
        if dest.is_file():
            return dest
        import mlx.core as mx
        from mlx_audio.tts.utils import load_model
        mx.set_cache_limit(256 * 1024**2)
        mx.random.seed(seed)
        model = load_model(folder)
        try:
            if reference is not None:
                # Loading the diffusion model consumes random numbers during initialization.
                mx.random.seed(seed)
                samples, rate = conversation_samples(model, text, reference)
            else:
                samples, rate = speech_samples(model, text, 'sohee', PLAYFUL, TEMPERATURE,
                                               max_tokens=PRESENTER_MAX_TOKENS)
            return save_take(dest, samples, rate)
        finally:
            del model
            gc.collect()
            mx.clear_cache()


def narrate(data: Path, cache: Path, text: str, speaker=SPEAKER, take=1) -> Path:
    if speaker not in SPEAKERS:
        raise ValueError('등록된 한국어 화자를 선택하세요.')
    if type(take) is not int or take < 1 or (take != 1 and speaker not in CONVERSATION_VOICES):
        raise ValueError('테이크 번호는 대화체 화자에게 1부터 지정하세요.')
    reference = None
    seed = TAKE_SEED
    if speaker in CONVERSATION_VOICES:
        model_name = 'shorts-conversation'
        reference = Path(__file__).with_name('sounds') / (speaker + '.flac')
        seed = (23 + (take - 1) * 101) % 2**32
        fingerprint = hashlib.sha256(reference.read_bytes()).hexdigest()
        settings = f'{fingerprint}/{DIFFUSION_STEPS}/{GUIDANCE}/{seed}/{CONVERSATION_MAX_TOKENS}'
    elif speaker == PRESENTER:
        model_name = 'voice'
        settings = f'{PLAYFUL}/{TEMPERATURE}/{TAKE_SEED}/{PRESENTER_MAX_TOKENS}'
    else:
        model_name = 'shorts-voice'
        settings = f'{STEPS}/1.0'
    spec = model_specs()[model_name]
    key = hashlib.sha256(f'{spec["revision"]}/{speaker}/ko/{settings}/{text}'.encode()).hexdigest()
    dest = cache / f'{key}.wav'
    if dest.is_file():
        return dest
    if reference is not None or speaker == PRESENTER:
        folder = data / 'local/models' / spec.get('directory', model_name)
        return mlx_take(data, folder, dest, text, reference, seed)
    import numpy as np
    engine = narrator(data / 'local/models' / spec['directory'])
    wav, duration = engine.synthesize(text, engine.get_voice_style(speaker), lang='ko', speed=1.0, total_steps=STEPS)
    samples = np.squeeze(wav)[:round(float(duration[0]) * engine.sample_rate)]
    if samples.ndim != 1 or not samples.size or not np.isfinite(samples).all() or np.abs(samples).max() < .001:
        raise ValueError('내레이션에서 유효한 신호를 찾지 못했습니다.')
    return save_take(dest, samples, engine.sample_rate)
