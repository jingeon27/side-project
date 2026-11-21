"""The editorial contract and two-episode daily archive."""
from datetime import date, datetime
import fcntl
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo
from .voice import CONVERSATION_VOICES, SPEAKERS, speaker_for

DAILY_TARGET = 2
MUSIC = {'tap', 'pulse', 'steps', 'silence', 'bell', 'resolve'}
THEMES = {'vermilion', 'cobalt'}


def seoul_date():
    return datetime.now(ZoneInfo('Asia/Seoul')).date().isoformat()


def post_number(url):
    address = urlsplit(url)
    if address.hostname == 'm.dcinside.com':
        match = re.fullmatch(r'/board/dcbest/(\d+)/?', address.path)
        if match:
            return match[1]
    query = parse_qs(address.query)
    if address.hostname == 'gall.dcinside.com' and address.path.rstrip('/') == '/board/view' and query.get('id') == ['dcbest']:
        numbers = query.get('no', [])
        if len(numbers) == 1 and numbers[0].isdigit():
            return numbers[0]
    raise ValueError('실베 글의 고유 주소가 필요합니다.')


def require_text(record, keys):
    if not isinstance(record, dict):
        raise ValueError('편집 항목은 JSON 객체여야 합니다.')
    for key in keys:
        if not isinstance(record.get(key), str) or not record[key].strip():
            raise ValueError(f'{key}에 문구를 입력하세요.')


def local_asset(folder, record, field):
    require_text(record, [field])
    path = (folder / record[field]).resolve()
    if not path.is_relative_to((folder / 'assets').resolve()) or not path.is_file():
        raise ValueError(f'{field}에는 에피소드 assets 안의 파일을 지정하세요.')
    return path


def read_episode(folder):
    episode = json.loads((folder / 'episode.json').read_text(encoding='utf8'))
    require_text(episode, ['slug', 'title', 'series', 'theme', 'description', 'comment', 'cover', 'credits'])
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', episode['slug']) or len(episode['slug']) > 80:
        raise ValueError('slug는 영문 소문자, 숫자, 붙임표로 지정하세요.')
    if episode['theme'] not in THEMES:
        raise ValueError(f'theme 값은 {sorted(THEMES)} 중 골라주세요.')
    require_text(episode.get('lead'), ['url', 'title', 'published'])
    post_number(episode['lead']['url'])
    date.fromisoformat(episode['lead']['published'])
    if not isinstance(episode.get('sources'), list) or not episode['sources']:
        raise ValueError('사실을 확인한 1차 출처를 추가하세요.')
    for source in episode['sources']:
        require_text(source, ['label', 'url'])
        address = urlsplit(source['url'])
        if address.scheme != 'https' or not address.hostname:
            raise ValueError('확인 자료의 HTTPS 주소가 필요합니다.')
    if not isinstance(episode.get('tags'), list) or not all(isinstance(tag, str) for tag in episode['tags']):
        raise ValueError('tags에는 태그 문자열 목록이 필요합니다.')
    shots = episode.get('shots')
    if 'narrator' in episode and (not isinstance(episode['narrator'], str) or episode['narrator'] not in SPEAKERS):
        raise ValueError('등록된 진행자 음성을 선택하세요.')
    if not isinstance(shots, list) or not 1 <= len(shots) <= 12:
        raise ValueError('1~12개의 컷을 지정하세요.')
    for shot in shots:
        require_text(shot, ['head', 'voice', 'caption', 'visual', 'credit'])
        if type(shot.get('seconds')) is not int or shot['seconds'] < 1:
            raise ValueError('컷의 seconds는 양의 정수입니다.')
        if 'recording' in shot:
            local_asset(folder, shot, 'recording')
        if 'speaker' in shot and (not isinstance(shot['speaker'], str) or shot['speaker'] not in SPEAKERS):
            raise ValueError('등록된 진행자 또는 댓글 화자를 선택하세요.')
        if 'voiceTake' in shot and (type(shot['voiceTake']) is not int or shot['voiceTake'] < 1
                                    or speaker_for(episode, shot) not in CONVERSATION_VOICES):
            raise ValueError('voiceTake는 대화체 합성 화자에 1부터 지정하세요.')
        if shot.get('camera', 'hold') not in ('hold', 'push'):
            raise ValueError('카메라 움직임은 hold 또는 push로 지정하세요.')
        if 'sourceComment' in shot:
            comment = shot['sourceComment']
            require_text(comment, ['quote', 'anchor', 'time'])
            local_asset(folder, comment, 'capture')
            if 'shownAsCaption' in comment:
                if type(comment['shownAsCaption']) is not bool:
                    raise ValueError('shownAsCaption에는 참 또는 거짓을 지정하세요.')
                if comment['shownAsCaption'] and ''.join(comment['quote'].split()) != ''.join(shot['caption'].split()):
                    raise ValueError('자막으로 쓰는 캡처와 자막 원고는 같은 댓글이어야 합니다.')
            if not re.fullmatch(r'[A-Za-z0-9_-]+', comment['anchor']):
                raise ValueError('댓글의 원문 위치를 확인하세요.')
        if 'media' in shot:
            media = shot['media']
            local_asset(folder, media, 'file')
            box = media.get('box')
            if not isinstance(box, list) or len(box) != 4 or any(type(n) is not int for n in box):
                raise ValueError('영상 위치에 [x, y, 너비, 높이]가 필요합니다.')
            x, y, w, h = box
            if min(x, y) < 0 or min(w, h) < 2 or x+w > 1080 or y+h > 1920:
                raise ValueError('영상 위치는 세로 화면 안이어야 합니다.')
    if sum(shot['seconds'] for shot in shots) != 30:
        raise ValueError('컷 길이의 합이 30초여야 합니다.')
    if type(episode.get('tonic')) is not int or not 36 <= episode['tonic'] <= 72:
        raise ValueError('tonic은 36~72 사이의 MIDI 음 번호입니다.')
    cues = episode.get('music')
    if not isinstance(cues, list) or not cues:
        raise ValueError('시작 시각과 브금 큐를 적으세요.')
    previous = -1
    for cue in cues:
        require_text(cue, ['mode', 'note'])
        at = cue.get('at')
        if type(at) not in (int, float) or not math.isfinite(at) or not previous < at < 30 or at < 0 or cue['mode'] not in MUSIC:
            raise ValueError('브금 큐는 0~30초 안에 시각 순서대로 지정하세요.')
        previous = at
    if cues[0]['at'] != 0:
        raise ValueError('첫 브금 큐는 0초에서 시작합니다.')
    return episode


def archive(home):
    results = []
    for receipt in sorted(home.glob('????-??-??/[0-9][0-9]-*/episode.json')):
        if (receipt.parent / 'short.mp4').is_file():
            entry = json.loads(receipt.read_text(encoding='utf8'))
            results.append({'date': receipt.parent.parent.name, 'post': post_number(entry['lead']['url']),
                            'title': entry['title'], 'folder': str(receipt.parent)})
    return results


def build_atomic(folder, episode, dest, render):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        raise FileExistsError(f'이미 있는 편집본입니다: {dest}')
    # Only complete directories appear in the public archive. Interrupted work can be retried.
    with tempfile.TemporaryDirectory(dir=dest.parent, prefix='.short-') as temp:
        staging = Path(temp) / 'edition'
        staging.mkdir()
        render(folder, episode, staging)
        staging.rename(dest)


def run_day(home, day, folders, render):
    date.fromisoformat(day)
    home.mkdir(parents=True, exist_ok=True)
    made, failures = [], []
    with (home / '.daily.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        history = archive(home)
        seen = {entry['post'] for entry in history}
        today = [entry for entry in history if entry['date'] == day]
        used_slots = {int(Path(entry['folder']).name[:2]) for entry in today}
        for folder in folders:
            if len(used_slots) >= DAILY_TARGET:
                break
            try:
                episode = read_episode(folder)
                post = post_number(episode['lead']['url'])
                if post in seen:
                    continue
                slot = next(index for index in range(1, DAILY_TARGET + 1) if index not in used_slots)
                dest = home / day / f"{slot:02}-{episode['slug']}"
                build_atomic(folder, episode, dest, render)
                seen.add(post)
                used_slots.add(slot)
                made.append(str(dest))
            except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
                failures.append({'folder': str(folder), 'error': str(error)})
    return {'date': day, 'created': made, 'remaining': DAILY_TARGET - len(used_slots), 'failures': failures}
