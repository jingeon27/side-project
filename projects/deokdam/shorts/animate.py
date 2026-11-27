"""Generate the storyboard's moving shots with Story Studio's local animation worker."""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

sys.dont_write_bytecode = True
from prepare import PROJECT, SHORTS, read_json

ENGINE = PROJECT.parent / 'story-studio/apps/engine'
EXAMPLES = ENGINE.parent / 'web/public/examples'


def generate_clip(data_dir, artwork, inputs, target):
    from PIL import Image

    assets = data_dir / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    reference = assets / f'{uuid.uuid4()}.png'
    log_path = target.with_suffix('.log')
    try:
        with Image.open(artwork) as image:
            image.convert('RGB').save(reference)
        request = {key: value for key, value in inputs.items() if key != 'sourceSha256'}
        request['image'] = '/api/assets/' + reference.name
        with log_path.open('w', encoding='utf8') as log:
            run = subprocess.run(
                [sys.executable, '-m', 'story_studio', '--data-dir', str(data_dir), '--examples-dir', str(EXAMPLES)],
                cwd=ENGINE, env={**os.environ, 'PYTHONPATH': str(ENGINE / 'src')},
                input=json.dumps(request) + '\n', stdout=subprocess.PIPE, stderr=log, text=True,
            )
        messages = [json.loads(line) for line in run.stdout.splitlines()]
        if run.returncode or not messages or 'result' not in messages[-1]:
            raise RuntimeError(f'영상 생성에 실패했습니다. {log_path}')
        result = messages[-1]
        asset = result['result']['asset']
        if not re.fullmatch(r'/api/assets/[a-f0-9-]{36}\.mp4', asset):
            raise ValueError('Story Studio가 유효한 영상 자산을 반환하지 않았습니다.')
        rendered = assets / Path(asset).name
        with tempfile.TemporaryDirectory(prefix='.motion-', dir=target.parent) as temporary:
            clip = Path(temporary) / target.name
            shutil.copyfile(rendered, clip)
            receipt = clip.with_suffix('.json')
            stats = {key: value for key, value in result.items() if key != 'result'}
            receipt.write_text(json.dumps({'inputs': inputs, 'worker': stats}, ensure_ascii=False, indent=2) + '\n',
                               encoding='utf8')
            receipt.replace(target.with_suffix('.json'))
            clip.rename(target)
        rendered.unlink()
    finally:
        reference.unlink(missing_ok=True)


def animate(slug, only, data_dir, output):
    stories = read_json(SHORTS / 'storylines.json')
    if slug not in stories:
        raise ValueError(f'등록된 회차를 선택하세요. {slug}')
    selected = [
        (number, shot) for number, shot in enumerate(stories[slug]['shots'], 1)
        if 'motion' in shot and (only is None or only == number)
    ]
    if not selected:
        raise ValueError('움직임 지시가 있는 컷을 선택하세요.')

    output.mkdir(parents=True, exist_ok=True)
    for number, shot in selected:
        motion = shot['motion']
        artwork = SHORTS / 'art' / f'{slug}-{shot["art"]}.webp'
        request = {
            'action': 'video', 'format': 'animation', 'ratio': '16:9', 'quality': 'draft',
            'duration': motion.get('duration', shot['seconds'] + 1), 'prompt': motion['prompt'], 'seed': motion['seed'],
            'tiling': motion.get('tiling', 'auto'),
        }
        target = output / f'{number:02}.mp4'
        inputs = {'sourceSha256': hashlib.sha256(artwork.read_bytes()).hexdigest(), **request}
        with target.with_suffix('.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            receipt = target.with_suffix('.json')
            if target.is_file() and receipt.is_file() and read_json(receipt).get('inputs') == inputs:
                print(f'{slug} {number}번 컷 재사용', flush=True)
                continue
            if target.exists():
                raise FileExistsError(f'다른 입력으로 생성된 컷이 있습니다. 새 출력 위치를 선택하세요. {target}')
            print(f'{slug} {number}번 컷 생성 중', flush=True)
            generate_clip(data_dir, artwork, inputs, target)
            print(target, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('slug')
    parser.add_argument('--shot', type=int, help='1부터 세는 컷 번호')
    parser.add_argument('--data-dir', type=Path, default=PROJECT / '.data/studio-runtime')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    animate(args.slug, args.shot, args.data_dir.resolve(),
            (args.output or PROJECT / '.data/shorts/motion' / args.slug).resolve())


if __name__ == '__main__':
    main()
