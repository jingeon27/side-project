"""Opt-in, checkpoint-bound inference calibration for one completed voice run."""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import wave

from ..catalog import model_specs
from .store import checkpoint_path, run_folder


@dataclass(frozen=True)
class SynthesisReference:
    audio: Path
    text: str


@dataclass(frozen=True)
class SynthesisProfile:
    speaker: Path
    verifier: Path
    talker_strength: float
    predictor_strength: float
    temperature: float
    seed: int
    reference: SynthesisReference | None = None


def _number(value, minimum, maximum):
    return type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum


def _read_reference(folder, profile):
    text = profile['referenceText']
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        raise ValueError('말투 기준 음성의 대본을 확인해 주세요')
    audio = folder / 'synthesis-reference.wav'
    if audio.stat().st_size > 2_000_000:
        raise ValueError('말투 기준 음성은 30초 이하로 준비해 주세요')
    if hashlib.sha256(audio.read_bytes()).hexdigest() != profile['referenceSha256']:
        raise ValueError('말투 기준 음성 파일이 변경되었습니다')
    with wave.open(str(audio), 'rb') as recording:
        frames = recording.getnframes()
        if (recording.getnchannels(), recording.getframerate(), recording.getsampwidth()) != (1, 24000, 2) or not 72000 <= frames <= 720000:
            raise ValueError('말투 기준 음성은 24kHz 모노 PCM16, 3~30초여야 합니다')
        if len(recording.readframes(frames)) != frames * 2:
            raise ValueError('말투 기준 음성이 잘렸습니다')
    return SynthesisReference(audio, text.strip())


def read_synthesis_profile(root, run_id):
    folder = run_folder(root, run_id)
    filename = folder / 'synthesis.json'
    if not filename.exists():
        return None
    try:
        if filename.stat().st_size > 16_384:
            raise ValueError('보정 설정이 너무 큽니다')
        profile = json.loads(filename.read_text())
        expected = {
            'version', 'runId', 'checkpoint', 'datasetHash', 'modelRevision',
            'adaptersSha256', 'speakerSha256', 'verifierRevision',
            'talkerStrength', 'predictorStrength', 'temperature', 'seed',
        }
        if not isinstance(profile, dict) or type(profile.get('version')) is not int or profile['version'] not in (1, 2):
            raise ValueError('지원하지 않는 음성 보정 설정입니다')
        if profile['version'] == 2:
            expected |= {'referenceSha256', 'referenceText'}
        if set(profile) != expected:
            raise ValueError('보정 설정 항목이 맞지 않습니다')
        checkpoint = checkpoint_path(folder)
        state = json.loads((checkpoint / 'state.json').read_text())
        if profile['runId'] != run_id:
            raise ValueError('지원하지 않는 음성 보정 설정입니다')
        if profile['checkpoint'] != checkpoint.name or any(profile[key] != state[key] for key in ['datasetHash', 'modelRevision']):
            raise ValueError('보정한 학습 가중치와 현재 실행이 다릅니다')
        predictor_limit = 1.5 if profile['version'] == 2 else 1
        if not _number(profile['talkerStrength'], .01, 1) or not _number(profile['predictorStrength'], .01, predictor_limit):
            raise ValueError('학습 가중치 적용 강도가 올바르지 않습니다')
        if not _number(profile['temperature'], .1, 1) or type(profile['seed']) is not int or not 0 <= profile['seed'] < 2**31:
            raise ValueError('음성 생성 설정이 올바르지 않습니다')
        speaker = folder / 'synthesis-speaker.safetensors'
        for path, key in [(speaker, 'speakerSha256'), (checkpoint / 'adapters.safetensors', 'adaptersSha256')]:
            if hashlib.sha256(path.read_bytes()).hexdigest() != profile[key]:
                raise ValueError('보정한 음성 파일이 변경되었습니다')
        spec = model_specs()['voice-asr']
        verifier = root / 'local/models' / spec['directory']
        if profile['verifierRevision'] != spec['revision'] or not (verifier / 'config.json').is_file():
            raise ValueError('대사 확인용 로컬 음성 인식 모델을 준비해 주세요')
        reference = _read_reference(folder, profile) if profile['version'] == 2 else None
        return SynthesisProfile(speaker, verifier, profile['talkerStrength'], profile['predictorStrength'], profile['temperature'], profile['seed'], reference)
    except (OSError, KeyError, TypeError, ValueError, wave.Error, EOFError) as error:
        raise ValueError('학습 음성의 보정 설정을 확인해 주세요. ' + str(error)) from error


def apply_synthesis_profile(model, profile):
    import mlx.core as mx
    from .training import set_speaker
    embedding = mx.load(str(profile.speaker))['embedding']
    if not bool(mx.all(mx.isfinite(embedding)).item()):
        raise ValueError('보정한 화자 특징이 손상되었습니다')
    set_speaker(model, embedding)
    for layers, strength in [
        (model.talker.model.layers, profile.talker_strength),
        (model.talker.code_predictor.model.layers, profile.predictor_strength),
    ]:
        for layer in layers:
            for name in ['q_proj', 'v_proj']:
                getattr(layer.self_attn, name).set_inference_strength(strength)
    if profile.reference is not None:
        if model.speaker_encoder is None or not model.speech_tokenizer.has_encoder:
            raise ValueError('말투 기준 음성을 사용할 수 있는 기본 모델이 필요합니다')
        # The pinned MLX ICL path uses the reference codec as acoustic context.
        # Keep the calibrated identity vector instead of estimating a new one
        # from each reference; this hook lives only on this job's model object.
        model.extract_speaker_embedding = lambda _audio: embedding
        model.config.tts_model_type = 'base'
