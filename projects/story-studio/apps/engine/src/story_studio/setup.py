"""Download pinned public models and prepare MLX weights. No API key or inference service."""
import argparse
import fcntl
import gc
import hashlib
import json
from .catalog import model_specs
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--only', choices=['all', 'voice-training'], default='all')
    args = parser.parse_args()
    from huggingface_hub import model_info, snapshot_download
    root = Path(args.data_dir).resolve() / 'local'
    root.mkdir(parents=True, exist_ok=True)
    specs = model_specs()
    selected = ['voice-train'] if args.only == 'voice-training' else ['text', 'voice', 'voice-train', 'wan-source']
    for name in selected:
        spec = specs[name]
        print(f'모델 준비: {name} ({spec["repo"]})', flush=True)
        patterns = ['*.json', '*.safetensors', '*.pth', 'google/umt5-xxl/*'] if name == 'wan-source' else None
        folder = root / 'models' / name
        info = model_info(spec['repo'], revision=spec['revision'], files_metadata=True)
        # Adopt an existing identical local copy without re-downloading large files.
        wanted = [entry for entry in info.siblings if entry.rfilename.endswith(('.safetensors', '.json'))]
        if not all((folder / entry.rfilename).is_file() and (folder / entry.rfilename).stat().st_size == entry.size for entry in wanted):
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
    spec = specs['tokenizer']
    snapshot_download(spec['repo'], revision=spec['revision'], local_dir=root / 'models/tokenizer',
                      allow_patterns=['tokenizer*.json', 'special_tokens_map.json', 'spiece.model', 'config.json'])
    if not (root / 'models/video/ready.json').is_file():
        with (root / 'gpu.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            import mlx.core as mx
            from mlx_video.models.wan_2 import convert
            # Keep conversions in bf16 and use a file-backed torch load to bound unified-memory use.
            def load_weights(filename):
                import torch
                tensors = torch.load(filename, map_location='cpu', weights_only=True, mmap=True)
                weights = {}
                for key, tensor in tensors.items():
                    if isinstance(tensor, torch.Tensor):
                        value = mx.array(tensor.float().numpy()).astype(mx.bfloat16)
                        mx.eval(value)
                        weights[key] = value
                return weights
            convert.load_torch_weights = load_weights
            mx.set_cache_limit(256 * 1024**2)
            print('Wan 영상을 위한 MLX 변환 중', flush=True)
            convert.convert_wan_checkpoint(str(root / 'models/wan-source'), str(root / 'models/video'),
                                           dtype='bfloat16', model_version='2.1', quantize=True, bits=8)
            gc.collect(); mx.clear_cache()
            (root / 'models/video/ready.json').write_text(json.dumps(specs['wan-source']))
    (root / 'ready.json').write_text(json.dumps(specs, ensure_ascii=False, indent=2))
    print('로컬 글·음성·영상 모델 준비 완료', flush=True)


if __name__ == '__main__':
    main()
