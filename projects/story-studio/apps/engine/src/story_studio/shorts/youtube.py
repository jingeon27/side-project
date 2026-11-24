"""Upload finished daily shorts with an explicit YouTube channel and visibility."""
from contextlib import contextmanager
from datetime import date
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from ..storage import atomic_json
from .edition import DAILY_TARGET, archive, read_episode, seoul_date
from .verify import verify_movie
from . import youtube_api as api


VISIBILITIES = ('private', 'unlisted', 'public')
TERMS = ('동의하면 업로드할 콘텐츠가 YouTube 서비스 약관과 커뮤니티 가이드를 준수함을 확인하는 것입니다. '
         '다른 사람의 저작권이나 개인정보를 침해하지 않도록 확인해 주세요. https://www.youtube.com/t/terms')
PERMISSIONS = 'https://myaccount.google.com/permissions'
PRIVACY = ('Story Studio는 YouTube 채널 확인과 영상 업로드에 Google OAuth를 사용합니다. '
           'Mac에 갱신 토큰과 전송 기록을 보관하며 선택한 MP4와 메타데이터를 YouTube로 전송합니다. '
           'Google 개인정보처리방침 https://policies.google.com/privacy\n'
           f'로컬 연결 및 전송 기록은 youtube disconnect로 지울 수 있습니다. Google 계정 권한 관리 {PERMISSIONS}')


def options(parser, day):
    commands = parser.add_subparsers(dest='youtube_command', required=True)
    connect = commands.add_parser('connect', help='브라우저에서 YouTube 채널 연결')
    connect.add_argument('client', type=Path, help='Google Cloud 데스크톱 앱 OAuth JSON 파일')
    connect.add_argument('--auto', metavar='공개범위', choices=VISIBILITIES, help='연결한 채널의 자동 업로드도 켜기')
    auto = commands.add_parser('auto', help='하루 완성본의 자동 업로드 켜기 또는 끄기')
    auto.add_argument('mode', choices=['on', 'off'])
    auto.add_argument('--privacy', choices=VISIBILITIES, default='private')
    auto.add_argument('--made-for-kids', action='store_true', help='아동용 콘텐츠인 경우 지정')
    upload = commands.add_parser('upload', help='날짜별 완성본을 YouTube에 업로드')
    upload.add_argument('--date', type=lambda value: date.fromisoformat(value).isoformat(), default=day)
    upload.add_argument('--episode', help='특정 편의 slug')
    upload.add_argument('--auto', action='store_true', help='사용자가 허용한 자동 업로드 설정 적용')
    upload.add_argument('--privacy', choices=VISIBILITIES, help='직접 업로드의 공개 범위. 기본은 private')
    upload.add_argument('--made-for-kids', action='store_true', help='아동용 콘텐츠인 경우 지정')
    upload.add_argument('--restart', action='store_true', help='YouTube Studio에서 중복이 없음을 확인한 편의 전송 다시 시작')
    commands.add_parser('status', help='로컬 연결과 자동 업로드 상태')
    commands.add_parser('disconnect', help='Google 승인 철회 요청 및 로컬 연결 데이터 삭제')


def read_json(path):
    try:
        return json.loads(path.read_text(encoding='utf8'))
    except FileNotFoundError:
        return None


@contextmanager
def locked_state(home):
    state = home / '.youtube'
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    if state.is_symlink() or state.stat().st_mode & 0o077:
        raise OSError('로컬 .youtube 폴더를 현재 사용자만 읽을 수 있게 설정하세요 (chmod 700).')
    with (state / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield state


def confirm(message):
    if not sys.stdin.isatty():
        raise ValueError('터미널에서 이 명령을 실행해 주세요.')
    print(message, file=sys.stderr)
    if input('계속하려면 "동의"를 입력하세요. ').strip() != '동의':
        raise ValueError('YouTube 작업을 취소했습니다.')


def authorized_channel(auth):
    token = api.refresh(auth)
    channel = api.channel(token)
    if channel['id'] != auth['channelId']:
        raise RuntimeError('Google이 반환한 채널이 이 제작함에 연결된 채널과 다릅니다.')
    return token, channel


def confirm_auto(channel, privacy, made_for_kids):
    starts = seoul_date()
    audience = '아동용' if made_for_kids else '일반 시청자용'
    confirm(f'YouTube 채널 {channel["title"]} ({channel["id"]})에 {starts}부터 제작된 하루 완성본을 '
            f'최대 {DAILY_TARGET}편씩 자동 업로드합니다. 공개 범위 {privacy}, {audience}.\n{TERMS}')
    return dict(startOn=starts, privacy=privacy, madeForKids=made_for_kids)


def connect_channel(auth_path, auth, args):
    client = api.desktop_client(args.client.expanduser())
    confirm(PRIVACY)
    access, refresh = api.authorize(client)
    channel = api.channel(access)
    if auth and channel['id'] != auth['channelId']:
        raise ValueError('이 제작함에는 다른 채널이 연결되어 있습니다. 연결을 해제한 뒤 새 채널을 선택하세요.')
    plan = auth.get('auto') if auth else None
    if args.auto:
        plan = confirm_auto(channel, args.auto, False)
    else:
        confirm(f'YouTube 채널 {channel["title"]} ({channel["id"]})을 이 Mac의 쇼츠 제작함에 연결합니다.')
    atomic_json(auth_path, dict(client=client, refreshToken=refresh, channelId=channel['id'], auto=plan))
    return {'connected': True, 'channel': channel, 'auto': plan}


def configure_auto(auth_path, auth, args):
    if args.mode == 'off':
        if auth:
            atomic_json(auth_path, {**auth, 'auto': None})
        return {'enabled': False}
    if not auth:
        raise ValueError('shorts youtube connect로 YouTube 채널을 먼저 연결하세요.')
    _, channel = authorized_channel(auth)
    plan = confirm_auto(channel, args.privacy, args.made_for_kids)
    atomic_json(auth_path, {**auth, 'auto': plan})
    return {'enabled': True, 'channel': channel, **plan}


def disconnect(state, auth_path, auth):
    revoked = None
    if auth:
        try:
            api.revoke(auth)
            revoked = True
        except RuntimeError:
            revoked = False
    auth_path.unlink(missing_ok=True)
    for receipt in state.glob('upload-*.json'):
        discard_remote_details(receipt, read_json(receipt))
    return {'connected': False, 'revoked': revoked,
            'googlePermissions': PERMISSIONS if revoked is False else None}


def metadata(episode, privacy, made_for_kids):
    links = [(source['label'], source['url']) for source in episode['sources']]
    if not any(url == episode['lead']['url'] for _, url in links):
        links.append(('실베 원문', episode['lead']['url']))
    description = '\n\n'.join(part for part in [
        episode['description'],
        '\n'.join(f'{label} {url}' for label, url in links),
        episode['credits'],
        ' '.join('#' + tag for tag in episode['tags'] if tag),
    ] if part)
    title = episode['title']
    if len(title) > 100 or len(description.encode('utf8')) > 5000 or re.search(r'[<>]', title + description):
        raise ValueError('episode.json의 제목은 100자, 설명·출처·크레딧 합계는 5,000바이트까지입니다. 꺾쇠는 쓸 수 없습니다.')
    return dict(
        snippet=dict(title=title, description=description, categoryId='22', defaultLanguage='ko', tags=episode['tags']),
        status=dict(privacyStatus=privacy, selfDeclaredMadeForKids=made_for_kids),
    )


def expire_remote_details(state, today):
    for path in state.glob('upload-*.json'):
        item = read_json(path)
        if 'recordedOn' not in item or (date.fromisoformat(today) - date.fromisoformat(item['recordedOn'])).days < 28:
            continue
        discard_remote_details(path, item)


def discard_remote_details(path, item):
    if item['phase'] == 'pending':
        path.unlink()
    else:
        # Preserve duplicate prevention when removing data returned by YouTube.
        atomic_json(path, dict(phase='uploaded' if item['phase'] == 'uploaded' else 'uncertain'))


def saved_upload(row, receipt, state='already_uploaded'):
    video_id = receipt.get('videoId')
    return dict(title=row['title'], state=state, videoId=video_id,
                url=f'https://www.youtube.com/shorts/{video_id}' if video_id else None,
                privacy=receipt.get('privacy'))


def complete_upload(path, row, response, channel_id, today):
    data = response.expect(200, 201)
    if not isinstance(data.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_-]{11}', data['id']):
        raise RuntimeError('전송은 끝났지만 YouTube 영상 ID가 없습니다. 같은 명령으로 전송 상태를 다시 확인하세요.')
    receipt = dict(phase='uploaded', videoId=data['id'], privacy=data.get('status', {}).get('privacyStatus'),
                   recordedOn=today)
    atomic_json(path, receipt)
    if data.get('snippet', {}).get('channelId', channel_id) != channel_id:
        raise RuntimeError('YouTube 응답의 채널이 연결된 채널과 다릅니다. YouTube Studio에서 해당 영상 위치를 확인하세요.')
    return saved_upload(row, receipt, 'uploaded')


def prepare_session(path, record, row, token, channel_id, payload, size, identity, today):
    if record and 'session' in record:
        reply = api.send_range(token, record['session'], record['size'])
        if reply.code in (200, 201):
            return complete_upload(path, row, reply, channel_id, today), None, 0
        if reply.code not in (404, 410):
            reply.expect(308)
            if record['identity'] != identity:
                raise ValueError('중단된 업로드의 MP4 또는 YouTube 설정이 달라졌습니다. 이전 설정으로 재시도하세요.')
            return None, record, api.received_bytes(reply, size)
        if record['phase'] == 'finishing':
            atomic_json(path, dict(phase='uncertain'))
            raise RuntimeError('YouTube가 최종 전송 결과를 확인해 주지 않습니다. 중복 방지를 위해 Studio에서 확인하세요.')
    if record and record['phase'] == 'uncertain':
        raise RuntimeError('마지막 전송 결과를 확인할 수 없습니다. Studio에서 확인한 뒤 해당 편만 --restart로 재시도하세요.')
    session = api.start_session(token, payload, size)
    record = dict(phase='pending', session=session, size=size, identity=identity, recordedOn=today)
    atomic_json(path, record)
    return None, record, 0


def upload_movie(state, row, payload, token, channel_id, today, restart):
    path = state / f'upload-{row["post"]}.json'
    record = read_json(path)
    if record and record['phase'] == 'uploaded':
        return saved_upload(row, record)
    movie = Path(row['folder']) / 'short.mp4'
    verify_movie(movie)
    with movie.open('rb') as file:
        size = os.fstat(file.fileno()).st_size
        signature = hashlib.file_digest(file, 'sha256').hexdigest()
        identity = hashlib.sha256(json.dumps([signature, payload], sort_keys=True).encode('utf8')).hexdigest()
        result, record, offset = prepare_session(path, None if restart else record, row,
                                                  token, channel_id, payload, size, identity, today)
        if result:
            return result
        while offset < size:
            file.seek(offset)
            content = file.read(min(size - offset, api.CHUNK))
            if not content:
                raise OSError('업로드 중 MP4가 변경되었습니다. 저장한 완성본을 확인하세요.')
            if offset + len(content) == size and record['phase'] != 'finishing':
                record = {**record, 'phase': 'finishing'}
                atomic_json(path, record)
            reply = api.send_range(token, record['session'], size, offset, content)
            if reply.code in (200, 201):
                return complete_upload(path, row, reply, channel_id, today)
            reply.expect(308)
            following = api.received_bytes(reply, size)
            if following <= offset or following > offset + len(content):
                raise RuntimeError('전송 위치가 맞지 않습니다. 같은 명령으로 업로드를 이어받으세요.')
            offset = following
    raise RuntimeError('YouTube 영상 ID가 확인되지 않았습니다.')


def upload_day(home, state, auth, args):
    today = seoul_date()
    plan = auth.get('auto') if auth else None
    if args.auto and (args.privacy or args.made_for_kids or args.restart):
        raise ValueError('--auto는 저장한 공개 범위와 시청자 설정을 사용합니다.')
    if args.restart and not args.episode:
        raise ValueError('--restart는 --episode로 편을 지정해야 합니다.')
    if args.auto and (not plan or not plan['startOn'] <= args.date <= today):
        return {'date': args.date, 'skipped': 'auto_off' if not plan else 'outside_auto_dates',
                'videos': [], 'failures': []}
    if not auth:
        raise ValueError('shorts youtube connect로 YouTube 채널을 먼저 연결하세요.')
    rows = [row for row in archive(home) if row['date'] == args.date
            and (not args.episode or Path(row['folder']).name[3:] == args.episode)][:DAILY_TARGET]
    if not rows and (args.episode or not args.auto):
        raise ValueError('선택한 날짜에 업로드할 완성본이 없습니다.')
    privacy = plan['privacy'] if args.auto else args.privacy or 'private'
    made_for_kids = plan['madeForKids'] if args.auto else args.made_for_kids
    report = {'date': args.date, 'videos': [], 'failures': []}
    jobs = []
    for row in rows:
        try:
            folder = Path(row['folder'])
            if not folder.resolve().is_relative_to((home / args.date).resolve()):
                raise ValueError('날짜별 제작함 안에 저장된 완성본을 사용하세요.')
            item = read_json(state / f'upload-{row["post"]}.json')
            if item and item['phase'] == 'uploaded':
                report['videos'].append(saved_upload(row, item))
                continue
            jobs.append((row, metadata(read_episode(folder), privacy, made_for_kids)))
        except (OSError, ValueError) as error:
            report['failures'].append({'title': row['title'], 'error': str(error)})
    if not jobs:
        return report
    token, channel = authorized_channel(auth)
    report['channel'] = channel
    if not args.auto:
        descriptions = '\n\n'.join(f'{row["title"]}\n{payload["snippet"]["description"]}' for row, payload in jobs)
        restart_note = 'Studio에 동일한 영상이 없는지 확인한 뒤 새로 전송합니다.\n' if args.restart else ''
        audience = '아동용' if made_for_kids else '일반 시청자용'
        confirm(f'YouTube 채널 {channel["title"]} ({channel["id"]}) · {privacy} · {audience}\n'
                f'{descriptions}\n\n{restart_note}{TERMS}')
    for row, payload in jobs:
        try:
            item = upload_movie(state, row, payload, token, channel['id'], today, args.restart)
            report['videos'].append(item)
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
            report['failures'].append({'title': row['title'], 'error': str(error)})
    return report


def run(home, args):
    with locked_state(home) as state:
        auth_path = state / 'authorization.json'
        auth = read_json(auth_path)
        expire_remote_details(state, seoul_date())
        match args.youtube_command:
            case 'connect':
                return connect_channel(auth_path, auth, args)
            case 'auto':
                return configure_auto(auth_path, auth, args)
            case 'upload':
                return upload_day(home, state, auth, args)
            case 'disconnect':
                return disconnect(state, auth_path, auth)
            case 'status':
                return {'connected': bool(auth), 'channelId': auth['channelId'] if auth else None,
                        'auto': auth.get('auto') if auth else None}
