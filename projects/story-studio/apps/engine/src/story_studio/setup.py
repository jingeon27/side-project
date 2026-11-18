"""Download pinned public models and prepare MLX weights. No API key or inference service."""
import argparse
from contextlib import contextmanager
import fcntl
from fnmatch import fnmatch
import gc
import hashlib
import json
import shutil
from .catalog import IMAGE_MODEL_DIRECTORY, PREPARED_DIRECTORIES, VIDEO_MODEL_DIRECTORY, model_specs
from pathlib import Path


def wanted_files(siblings, patterns):
    """Weights and configs a pinned snapshot must contain, limited to the requested patterns."""
    if patterns is not None:
        return [entry for entry in siblings if any(fnmatch(entry.rfilename, pattern) for pattern in patterns)]
    return [entry for entry in siblings if entry.rfilename.endswith(('.safetensors', '.json', '.jinja'))]


def prepared(root, name, spec):
    """A model prepared from this exact source no longer needs the removed download."""
    directory = PREPARED_DIRECTORIES.get(name)
    if directory is None:
        return False
    ready = root / 'models' / directory / 'ready.json'
    return ready.is_file() and json.loads(ready.read_text()) == spec


@contextmanager
def gpu_lock(root):
    with (root / 'gpu.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def prepare_image(root, source, spec):
    """Save FLUX.2 Klein once in 8 bits: about half the bf16 size, and no quantizing at every load."""
    output = root / 'models' / IMAGE_MODEL_DIRECTORY
    with gpu_lock(root):
        from mflux.models.common.config import ModelConfig
        from mflux.models.flux2.variants import Flux2Klein
        print('FLUX.2 Klein을 8비트로 저장하는 중', flush=True)
        # An interrupted save has no ready.json; start it again from an empty folder.
        shutil.rmtree(output, ignore_errors=True)
        Flux2Klein(quantize=8, model_path=str(source), model_config=ModelConfig.flux2_klein_4b()).save_model(str(output))
        (output / 'ready.json').write_text(json.dumps(spec))


def prepare_video(root, source, spec):
    output = root / 'models' / VIDEO_MODEL_DIRECTORY
    with gpu_lock(root):
        import mlx.core as mx
        from mlx_video.models.wan_2 import convert
        # Use a file-backed torch load to bound unified-memory use. Keep each tensor's stored
        # precision: the T5 encoder ships in bf16 and the Wan2.2 VAE decodes in float32.
        def load_weights(filename):
            import torch
            tensors = torch.load(filename, map_location='cpu', weights_only=True, mmap=True)
            weights = {}
            for key, tensor in tensors.items():
                if isinstance(tensor, torch.Tensor):
                    value = mx.array(tensor.float().numpy()).astype(mx.bfloat16 if tensor.dtype == torch.bfloat16 else mx.float32)
                    mx.eval(value)
                    weights[key] = value
            return weights
        convert.load_torch_weights = load_weights
        mx.set_cache_limit(256 * 1024**2)
        print('Wan2.2 영상을 위한 MLX 변환 중', flush=True)
        convert.convert_wan_checkpoint(str(source), str(output), dtype='bfloat16', model_version='2.2', quantize=True, bits=8)
        gc.collect(); mx.clear_cache()
        (output / 'ready.json').write_text(json.dumps(spec))


PREPARE = {'image': prepare_image, 'video-source': prepare_video}
MODEL_GROUPS = {
    'all': ('text', 'embedding', 'voice', 'voice-train', 'image', 'video-source'),
    'image': ('text', 'image'),
    'voice-training': ('voice-train',),
    'voice-verification': ('voice-asr',),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--only', choices=MODEL_GROUPS, default='all')
    args = parser.parse_args()
    root = Path(args.data_dir).resolve() / 'local'
    root.mkdir(parents=True, exist_ok=True)
    # The full and image-only installers share download and conversion directories.
    with (root / 'setup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        install_models(root, args.only)


def install_models(root, profile):
    from huggingface_hub import model_info, snapshot_download
    specs = model_specs()
    for name in MODEL_GROUPS[profile]:
        spec = specs[name]
        if prepared(root, name, spec):
            print(f'모델 준비됨: {name} ({spec["repo"]})', flush=True)
            continue
        print(f'모델 준비: {name} ({spec["repo"]})', flush=True)
        patterns = spec.get('patterns')
        folder = root / 'models' / spec.get('directory', name)
        info = model_info(spec['repo'], revision=spec['revision'], files_metadata=True)
        # Adopt an existing identical local copy without re-downloading large files.
        if not all((folder / entry.rfilename).is_file() and (folder / entry.rfilename).stat().st_size == entry.size for entry in wanted_files(info.siblings, patterns)):
            snapshot_download(spec['repo'], revision=spec['revision'], local_dir=folder, allow_patterns=patterns, max_workers=4)
        for entry in info.siblings:
            target = folder / entry.rfilename
            if target.is_file() and entry.lfs and entry.lfs.sha256:
                with target.open('rb') as file:
                    digest = hashlib.file_digest(file, 'sha256').hexdigest()
                if digest != entry.lfs.sha256:
                    raise ValueError(f'모델 파일 검증 실패: {entry.rfilename}')
        if name in PREPARE:
            PREPARE[name](root, folder, spec)
            # The prepared folder holds every weight the engine loads. Drop the verified source
            # (about 16 GB for Klein, 34 GB for Wan2.2) only after its ready.json is written.
            shutil.rmtree(folder)
    if profile == 'image':
        print('한국어 이미지 생성용 Gemma와 FLUX 준비 완료', flush=True)
        return
    if profile == 'voice-training':
        print('로컬 음성 학습 모델 준비 완료', flush=True)
        return
    if profile == 'voice-verification':
        print('로컬 대사 확인 모델 준비 완료', flush=True)
        return
    spec = specs['tokenizer']
    snapshot_download(spec['repo'], revision=spec['revision'], local_dir=root / 'models/tokenizer',
                      allow_patterns=['tokenizer*.json', 'special_tokens_map.json', 'spiece.model', 'config.json'])
    (root / 'ready.json').write_text(json.dumps(specs, ensure_ascii=False, indent=2))
    print('로컬 글, 자료 검색, 음성, 이미지, 영상 모델 준비 완료', flush=True)


if __name__ == '__main__':
    main()
