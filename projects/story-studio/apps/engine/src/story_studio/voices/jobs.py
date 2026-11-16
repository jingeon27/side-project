"""Dataset snapshots, resumable QLoRA execution and completed voice loading."""
import hashlib
import json
from pathlib import Path
import re
from ..catalog import model_specs
from ..storage import atomic_json
from .store import identifier, run_folder, checkpoint_path


def train(root, request, progress, save_task):
    import mlx.core as mx
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    from .training import attach_adapters, set_speaker, prepare_sample, train_steps
    folder = run_folder(root, request['runId'])
    config = json.loads((folder / 'config.json').read_text())
    if config['id'] != request['runId'] or request.get('taskId') != config['id']:
        raise ValueError('학습 요청과 저장된 설정이 일치하지 않습니다')
    voice_id = identifier(config['voiceId'])
    sample_ids = config['sampleIds']
    if not 2 <= len(sample_ids) <= 50 or len(set(sample_ids)) != len(sample_ids) or not 1 <= config['epochs'] <= 20:
        raise ValueError('학습 데이터와 반복 횟수를 확인해 주세요')
    samples = [json.loads((root / 'voices' / voice_id / 'samples' / (identifier(sample_id) + '.json')).read_text()) for sample_id in sample_ids]
    fields = ('id', 'transcript', 'contentHash', 'audioHash', 'asset')
    fingerprint = json.dumps([{key: sample[key] for key in fields} for sample in sorted(samples, key=lambda sample: sample['id'])], ensure_ascii=False, separators=(',', ':'))
    if hashlib.sha256(fingerprint.encode()).hexdigest() != config['datasetHash']:
        raise ValueError('녹음이나 대본이 변경되었습니다. 새 학습을 시작해 주세요')
    paths = []
    for sample_id, sample in zip(sample_ids, samples):
        if sample['id'] != sample_id or not re.fullmatch(r'/api/assets/[a-f0-9-]{36}\.wav', sample['asset']):
            raise ValueError('녹음 파일 정보가 올바르지 않습니다')
        filename = root / 'assets' / Path(sample['asset']).name
        if hashlib.sha256(filename.read_bytes()).hexdigest() != sample['audioHash']:
            raise ValueError('저장된 녹음 파일이 변경되거나 손상되었습니다')
        paths.append(filename)
    revision = model_specs()['voice-train']['revision']
    metadata = {'datasetHash': config['datasetHash'], 'modelRevision': revision}
    resume = checkpoint_path(folder) if request.get('resume') else None
    if resume:
        saved = json.loads((resume / 'state.json').read_text())
        if any(saved.get(key) != value for key, value in metadata.items()) or saved['total'] != len(samples) * config['epochs']:
            raise ValueError('체크포인트의 데이터나 모델 버전이 다릅니다. 새 학습을 시작해 주세요')
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(20 * 1024**3)
    progress('음성 학습 모델을 불러오는 중')
    model = load_model(root / 'local/models/voice-train')
    progress('녹음에서 화자 특징과 오디오 코드를 준비하는 중')
    embeddings = []
    for filename in paths[:10]:
        audio, _ = sf.read(filename, dtype='float32')
        embeddings.append(model.extract_speaker_embedding(mx.array(audio)))
    embedding = mx.mean(mx.stack(embeddings), axis=0)
    set_speaker(model, embedding)
    parameters = attach_adapters(model)
    prepared = []
    for index, (filename, sample) in enumerate(zip(paths, samples)):
        progress(f'학습 녹음 준비 중 {index + 1}/{len(samples)}')
        prepared.append(prepare_sample(model, filename, sample['transcript']))
    def on_step(state, checkpoint):
        save_task('RUNNING', step=state['step'], total=state['total'], loss=state['loss'], gradientNorm=state['gradientNorm'],
                  peakMemoryGiB=round(mx.get_peak_memory() / 1024**3, 2), trainableParameters=parameters,
                  checkpoint=checkpoint.name if checkpoint else None,
                  progress=f"가중치 학습 중 {state['step']}/{state['total']}")
    final = train_steps(model, prepared, embedding, folder / 'checkpoints', config['epochs'], on_step, resume=resume, metadata=metadata)
    save_task('SUCCEEDED', checkpoint=final.name, step=len(samples) * config['epochs'], progress='학습 완료', error=None)
    atomic_json(root / 'voices' / voice_id / 'current.json', {'runId': config['id']})
    return {'runId': config['id']}


def load_trained(root, run_id):
    from mlx_audio.tts.utils import load_model
    from .training import attach_adapters, load_checkpoint
    from .synthesis_profile import read_synthesis_profile, apply_synthesis_profile
    folder = run_folder(root, run_id)
    status = json.loads((folder / 'status.json').read_text())
    if status['status'] != 'SUCCEEDED':
        raise ValueError('완료된 학습 가중치가 필요합니다')
    checkpoint = checkpoint_path(folder)
    saved = json.loads((checkpoint / 'state.json').read_text())
    revision = model_specs()['voice-train']['revision']
    if saved.get('modelRevision') != revision:
        raise ValueError('학습한 기본 모델 버전이 다릅니다. 같은 버전으로 복원하거나 새로 학습해 주세요')
    profile = read_synthesis_profile(root, run_id)
    model = load_model(root / 'local/models/voice-train')
    attach_adapters(model)
    load_checkpoint(model, checkpoint)
    if profile is not None:
        apply_synthesis_profile(model, profile)
    return model
