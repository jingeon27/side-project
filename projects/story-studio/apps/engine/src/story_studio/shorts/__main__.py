import argparse
from datetime import date
from functools import partial
import json
import os
from pathlib import Path
import subprocess
import sys

from .edition import DAILY_TARGET, archive, build_atomic, read_episode, run_day, seoul_date
from .render import render_film
from .verify import verify_movie


def main():
    parser = argparse.ArgumentParser(description='실베에서 발견한 질문으로 만드는 30초 다큐. 음성 준비: setup-voice. 브라우저 명령: capture, boards, leads.')
    cmds = parser.add_subparsers(required=True, dest='command')
    for command in ['status', 'daily']:
        sub = cmds.add_parser(command, help='제작 현황' if command == 'status' else '하루 최대 두 편을 로컬 MP4로 제작')
        sub.add_argument('--date', default=seoul_date(), type=lambda value: date.fromisoformat(value).isoformat(), help='한국 날짜 YYYY-MM-DD')
        if command == 'daily':
            sub.add_argument('folders', type=Path, nargs='*', help='소재 폴더. 생략하면 inbox를 읽습니다.')
    verify = cmds.add_parser('verify', help='MP4 디코딩과 길이·크기·코덱 확인')
    verify.add_argument('movie', type=Path)
    preview = cmds.add_parser('render', help='한 편을 지정한 새 폴더에 렌더')
    preview.add_argument('folder', type=Path)
    preview.add_argument('output', type=Path)
    args = parser.parse_args()
    home = Path(os.environ.get('SHORTS_HOME', Path.home() / 'Movies/실베다큐')).expanduser().resolve()
    (home / 'inbox').mkdir(parents=True, exist_ok=True)
    data = Path(os.environ['STORY_STUDIO_DATA_DIR'])
    render = partial(render_film, data=data, cache=home / '.voices')
    if args.command == 'verify':
        result = verify_movie(args.movie)
    elif args.command == 'status':
        history = archive(home)
        today = [entry for entry in history if entry['date'] == args.date]
        result = {'date': args.date, 'target': DAILY_TARGET, 'remaining': max(0, DAILY_TARGET - len(today)), 'today': today,
                  'usedPosts': [item['post'] for item in history], 'inbox': str(home / 'inbox')}
    elif args.command == 'daily':
        folders = args.folders or [p.parent for p in sorted((home / 'inbox').glob('*/episode.json'))]
        result = run_day(home, args.date, [folder.resolve() for folder in folders], render)
    else:
        folder = args.folder.resolve()
        build_atomic(folder, read_episode(folder), args.output.resolve(), render)
        result = {'folder': str(args.output.resolve())}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(bool(result.get('failures')))


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
