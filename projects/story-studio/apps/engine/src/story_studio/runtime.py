"""One worker owns its progress stream, durable status and cancellation state."""
from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import sys
from typing import TextIO

from .storage import atomic_json
from .voices.store import checkpoint_path, run_folder


@dataclass
class JobContext:
    root: Path
    task_id: str | None = None
    training: bool = False
    running: bool = False
    cancelled: bool = False
    protocol: TextIO = field(default_factory=lambda: sys.stdout)

    def emit(self, value):
        try:
            print(json.dumps(value, ensure_ascii=False), file=self.protocol, flush=True)
        except (BrokenPipeError, OSError):
            pass

    def save_task(self, status, **fields):
        if not self.task_id:
            return
        if self.training:
            folder = run_folder(self.root, self.task_id)
            target = folder / 'status.json'
            previous = json.loads(target.read_text())
            # A checkpoint is committed before progress; recover that narrow crash window.
            try:
                fields.setdefault('checkpoint', checkpoint_path(folder).name)
            except OSError:
                pass
            values = {**previous, 'status': status, 'ownerPid': os.getpid(), **fields}
            atomic_json(target, {key: value for key, value in values.items() if value is not None})
            return
        atomic_json(self.root / 'tasks' / (self.task_id + '.json'), {
            'id': self.task_id, 'status': status, 'ownerPid': os.getpid(), **fields,
        })

    def progress(self, message):
        self.save_task('RUNNING' if self.running else 'PENDING', progress=message)
        self.emit({'progress': message})

    def stop(self, signum, frame):
        self.cancelled = True
        raise InterruptedError('사용자가 생성을 중단했습니다')

    def clear_active(self):
        active = self.root / 'local/active.json'
        try:
            if json.loads(active.read_text())['pid'] == os.getpid():
                active.unlink(missing_ok=True)
        except (OSError, ValueError, KeyError):
            pass
