"""Bounded cache of frozen Qwen features, never of an adapter's action scores."""
import hashlib
import json
import os
from pathlib import Path

import mlx.core as mx


class FeatureCache:
    def __init__(self, directory, input_size, hidden_size, maximum=4096):
        self.directory = Path(directory)
        self.input_size, self.hidden_size, self.maximum = input_size, hidden_size, maximum
        self.writes = 0

    def key(self, model, prompt, controller):
        return hashlib.sha256(json.dumps(['frozen-qwen-last-mlp-text-v1',model,controller,prompt],ensure_ascii=False).encode()).hexdigest()

    def get(self, key):
        path = self.directory / (key+'.npz')
        if not path.exists():
            return None
        try:
            value = mx.load(str(path))
            if (value['features'].shape != (self.input_size,) or value['base'].shape != (self.hidden_size,)
                    or not bool(mx.all(mx.isfinite(value['features'])).item()) or not bool(mx.all(mx.isfinite(value['base'])).item())):
                return None
            return value
        except (ValueError, RuntimeError, KeyError):
            return None

    def put(self, key, features):
        self.directory.mkdir(parents=True,exist_ok=True,mode=0o700)
        path = self.directory / (key+'.npz')
        temporary = path.with_name(f'{key}.{os.getpid()}.tmp.npz')
        mx.savez(str(temporary),**features)
        temporary.replace(path)
        self.writes += 1
        if self.writes % 32 == 0:
            files = sorted(self.directory.glob('*.npz'),key=lambda p:p.stat().st_mtime,reverse=True)
            for old in files[self.maximum:]:
                old.unlink(missing_ok=True)
