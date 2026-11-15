"""Process entry point: offline policy, one GPU job, JSON protocol and cleanup."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import sys
import time
import traceback

from .generation.speech import generate_voice
from .generation.text import generate_text
from .generation.visual import generate_visual
from .media import compose
from .runtime import JobContext
from .voices.jobs import train
from .voices.samples import normalize


def dispatch(request, job, examples_dir):
    if request['action'] == 'text':
        return generate_text(job.root, request, job.progress)
    if request['action'] == 'voice':
        return generate_voice(job.root, request, job.progress)
    if request['action'] in ('image', 'video'):
        return generate_visual(job.root, request, job.progress, request['action'] == 'image')
    if request['action'] == 'compose':
        return compose(job.root, request, examples_dir, job.progress)
    if request['action'] == 'normalize-voice':
        return normalize(job.root, request)
    if request['action'] == 'train-voice':
        return train(job.root, request, job.progress, job.save_task)
    raise ValueError('지원하지 않는 작업입니다')


def run_request(request, job, examples_dir):
    started = time.monotonic()
    with (job.root / 'local/gpu.lock').open('a') as lock:
        job.progress('로컬 모델 실행 순서를 기다리는 중')
        uses_model = request['action'] not in ('compose', 'normalize-voice')
        if uses_model:
            fcntl.flock(lock, fcntl.LOCK_EX)
        job.running = True
        if uses_model:
            (job.root / 'local/active.json').write_text(json.dumps({
                'pid': os.getpid(), 'action': request['action'], 'taskId': job.task_id,
            }))
        with contextlib.redirect_stdout(sys.stderr):
            result = dispatch(request, job, examples_dir)
        if job.task_id and not job.training:
            job.save_task('SUCCEEDED', asset=result['asset'])
        stats = {'elapsedSeconds': round(time.monotonic() - started, 2)}
        if 'mlx.core' in sys.modules:
            stats['peakMemoryGiB'] = round(sys.modules['mlx.core'].get_peak_memory() / 1024**3, 2)
        job.emit({'result': result, **stats})


def run_cli():
    parser = argparse.ArgumentParser(description='Story Studio local generation worker')
    parser.add_argument('--data-dir', required=True)
    parser.add_argument('--examples-dir', required=True)
    args = parser.parse_args()
    job = JobContext(Path(args.data_dir).resolve())
    try:
        os.nice(10)
        signal.signal(signal.SIGTERM, job.stop)
        os.environ.update(
            HF_HOME=str(job.root / 'local/cache'), HF_HUB_OFFLINE='1',
            TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1',
        )
        (job.root / 'local').mkdir(parents=True, exist_ok=True)
        request = json.load(sys.stdin)
        if request.get('taskId'):
            if not re.fullmatch(r'local-[a-f0-9-]{36}', request['taskId']):
                raise ValueError('올바른 로컬 작업이 아닙니다')
            job.task_id = request['taskId']
            job.training = request['action'] == 'train-voice'
        run_request(request, job, Path(args.examples_dir).resolve())
    except Exception:
        traceback.print_exc(file=sys.stderr)
        if job.training:
            job.save_task('CANCELLED' if job.cancelled else 'FAILED', error='학습을 중단했습니다. 저장된 가중치부터 이어서 학습할 수 있습니다.' if job.cancelled else '음성 학습이 중단되었습니다. 로컬 로그를 확인해 주세요. 녹음과 직전 가중치는 보존했습니다.')
        else:
            job.save_task('FAILED', error='사용자가 영상 생성을 중단했습니다. 원고는 보존됩니다.' if job.cancelled else '로컬 영상 생성이 중단되었습니다. 로컬 로그를 확인한 뒤 다시 시도해 주세요.')
        job.emit({'error': '로컬 모델 실행에 실패했습니다. 프로젝트의 로컬 로그를 확인해 주세요.'})
        sys.exit(1)
    finally:
        job.clear_active()


if __name__ == '__main__':
    run_cli()
