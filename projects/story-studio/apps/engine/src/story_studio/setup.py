"""Download pinned public models and prepare MLX weights. No API key or inference service."""
import argparse
import fcntl
from fnmatch import fnmatch
import gc
import hashlib
import json
from .catalog import VIDEO_MODEL_DIRECTORY, model_specs
from pathlib import Path


def wanted_files(siblings, patterns):
    """Weights and configs a pinned snapshot must contain, limited to the requested patterns."""
    return [entry for entry in siblings
            if entry.rfilename.endswith(('.safetensors', '.json'))
            and (patterns is None or any(fnmatch(entry.rfilename, pattern) for pattern in patterns))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--only', choices=['all', 'voice-training', 'voice-verification'], default='all')
    args = parser.parse_args()
    from huggingface_hub import model_info, snapshot_download
    root = Path(args.data_dir).resolve() / 'local'
    root.mkdir(parents=True, exist_ok=True)
    specs = model_specs()
    selected = {'voice-training': ['voice-train'], 'voice-verification': ['voice-asr']}.get(args.only, ['text', 'voice', 'voice-train', 'image', 'video-source'])
    for name in selected:
        spec = specs[name]
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
    if args.only == 'voice-training':
        print('로컬 음성 학습 모델 준비 완료', flush=True)
        return
    if args.only == 'voice-verification':
        print('로컬 대사 확인 모델 준비 완료', flush=True)
        return
    spec = specs['tokenizer']
    snapshot_download(spec['repo'], revision=spec['revision'], local_dir=root / 'models/tokenizer',
                      allow_patterns=['tokenizer*.json', 'special_tokens_map.json', 'spiece.model', 'config.json'])
    video = root / 'models' / VIDEO_MODEL_DIRECTORY
    ready = video / 'ready.json'
    if not (ready.is_file() and json.loads(ready.read_text()) == specs['video-source']):
        with (root / 'gpu.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
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
            convert.convert_wan_checkpoint(str(root / 'models/video-source'), str(video),
                                           dtype='bfloat16', model_version='2.2', quantize=True, bits=8)
            gc.collect(); mx.clear_cache()
            ready.write_text(json.dumps(specs['video-source']))
    (root / 'ready.json').write_text(json.dumps(specs, ensure_ascii=False, indent=2))
    print('로컬 글, 음성, 이미지, 영상 모델 준비 완료', flush=True)


if __name__ == '__main__':
    main()
