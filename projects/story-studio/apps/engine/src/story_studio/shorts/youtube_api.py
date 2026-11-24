"""Google desktop authorization and YouTube's resumable upload protocol."""
import base64
from dataclasses import dataclass
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import webbrowser


SCOPES = frozenset(f'https://www.googleapis.com/auth/{scope}' for scope in ('youtube.upload', 'youtube.readonly'))
AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN = 'https://oauth2.googleapis.com/token'
REVOKE = 'https://oauth2.googleapis.com/revoke'
API = 'https://www.googleapis.com/youtube/v3'
VIDEO_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos'
UPLOAD_PATHS = {'/upload/youtube/v3/videos', '/resumable/upload/youtube/v3/videos'}
CHUNK = 8 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 308 is an upload acknowledgement, and credentials must stay on the intended host.
        return None


@dataclass(frozen=True)
class Response:
    code: int
    headers: object
    body: dict

    def expect(self, *allowed):
        if self.code in allowed:
            return self.body
        error = self.body.get('error')
        reason = error
        if isinstance(error, dict):
            entries = error.get('errors', [])
            reason = entries[0].get('reason') if entries else error.get('status')
        reason = reason if isinstance(reason, str) else ''
        if reason == 'invalid_grant':
            raise RuntimeError('Google 연결이 만료되었거나 철회되었습니다. shorts youtube connect로 다시 연결하세요.')
        if reason in {'accessNotConfigured', 'SERVICE_DISABLED'}:
            raise RuntimeError('이 Google Cloud 프로젝트에서 YouTube Data API v3를 사용 설정하세요.')
        label = f' · {reason}' if re.fullmatch(r'[A-Za-z0-9_]+', reason) else ''
        raise RuntimeError(f'YouTube 또는 Google OAuth 요청 실패 (HTTP {self.code}{label}).')


def request(url, method='GET', *, token=None, data=None, headers=None):
    headers = dict(headers or {})
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        try:
            response = build_opener(NoRedirect()).open(Request(url, data=data, headers=headers, method=method), timeout=45)
        except HTTPError as error:
            response = error
        with response:
            try:
                body = json.loads(response.read(1024 * 1024))
            except (ValueError, UnicodeError):
                body = {}
            return Response(response.code, response.headers, body if isinstance(body, dict) else {})
    except (OSError, URLError) as error:
        raise RuntimeError('Google 전송 연결이 끊겼습니다. 같은 명령으로 다시 시도하세요.') from error


def form(url, **values):
    return request(url, 'POST', data=urlencode(values).encode('ascii'),
                   headers={'Content-Type': 'application/x-www-form-urlencoded'})


def desktop_client(path):
    config = json.loads(path.read_text(encoding='utf8'))
    client = config.get('installed') if isinstance(config, dict) else None
    if not isinstance(client, dict) or not isinstance(client.get('client_id'), str):
        raise ValueError('Google Cloud에서 내려받은 데스크톱 앱 OAuth JSON이 필요합니다.')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com', client['client_id']):
        raise ValueError('Google 데스크톱 앱 OAuth 클라이언트 ID가 올바르지 않습니다.')
    return {key: client[key] for key in ('client_id', 'client_secret') if client.get(key)}


def authorization_code(state, challenge, client_id):
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def do_GET(self):
            url = urlsplit(self.path)
            args = parse_qs(url.query)
            valid = (url.path == '/' and args.get('state') == [state]
                     and ('error' in args or bool(args.get('code'))))
            if valid:
                result.update(args)
            message = ('Google 응답을 받았습니다. 터미널에서 결과를 확인하세요.'
                       if valid else '이 요청은 대기 중인 Google 연결과 일치하지 않습니다.')
            self.send_response(200 if valid else 400)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers()
            self.wfile.write(message.encode('utf8'))

        def log_message(self, *_args):
            pass  # The callback path contains a one-time authorization code.

    with ThreadingHTTPServer(('127.0.0.1', 0), Callback) as server:
        redirect = f'http://127.0.0.1:{server.server_port}/'
        params = dict(client_id=client_id, redirect_uri=redirect, response_type='code',
                      scope=' '.join(sorted(SCOPES)), state=state, code_challenge=challenge,
                      code_challenge_method='S256', access_type='offline', prompt='select_account consent')
        if not webbrowser.open(AUTH + '?' + urlencode(params)):
            raise RuntimeError('기본 브라우저를 열지 못했습니다. Mac의 터미널에서 다시 실행하세요.')
        deadline = monotonic() + 240
        while not result and monotonic() < deadline:
            server.timeout = 1
            server.handle_request()
    if 'code' not in result or 'error' in result:
        raise RuntimeError('Google 연결이 승인되지 않았거나 대기 시간이 지났습니다.')
    return result['code'][0], redirect


def authorize(client):
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode('ascii')).digest()).decode('ascii').rstrip('=')
    code, redirect = authorization_code(secrets.token_urlsafe(32), challenge, client['client_id'])
    reply = form(TOKEN, **client, grant_type='authorization_code', redirect_uri=redirect,
                 code_verifier=verifier, code=code).expect(200)
    if ('scope' in reply and not SCOPES.issubset(reply['scope'].split())) or not reply.get('refresh_token'):
        raise RuntimeError('자동 업로드에는 채널 확인, 영상 업로드 권한과 오프라인 Google 연결이 필요합니다.')
    return reply['access_token'], reply['refresh_token']


def refresh(auth):
    return form(TOKEN, **auth['client'], grant_type='refresh_token',
                refresh_token=auth['refreshToken']).expect(200)['access_token']


def revoke(auth):
    form(REVOKE, token=auth['refreshToken']).expect(200)


def channel(token):
    params = urlencode({'part': 'snippet', 'mine': 'true', 'fields': 'items(id,snippet(title))'})
    items = request(f'{API}/channels?{params}', token=token).expect(200).get('items', [])
    if len(items) != 1 or not re.fullmatch(r'UC[\w-]{22}', items[0].get('id', ''), re.ASCII):
        raise RuntimeError('YouTube 채널 한 개를 확인할 수 없습니다. 업로드할 채널을 선택해 다시 연결하세요.')
    return dict(id=items[0]['id'], title=items[0]['snippet']['title'])


def session_url(url):
    address = urlsplit(url or '')
    if (address.scheme != 'https' or address.netloc not in {'www.googleapis.com', 'youtube.googleapis.com'}
            or address.path not in UPLOAD_PATHS or not parse_qs(address.query).get('upload_id')):
        raise RuntimeError('Google에서 유효한 YouTube 업로드 세션을 받지 못했습니다.')
    return url


def start_session(token, payload, size):
    params = urlencode({'uploadType': 'resumable', 'part': 'snippet,status'})
    response = request(f'{VIDEO_UPLOAD}?{params}', 'POST', token=token,
                       data=json.dumps(payload, ensure_ascii=False).encode('utf8'),
                       headers={'Content-Type': 'application/json; charset=UTF-8',
                                'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': str(size)})
    response.expect(200, 201)
    return session_url(response.headers.get('Location'))


def send_range(token, url, size, offset=None, content=b''):
    limit = offset + len(content) - 1 if offset is not None else None
    content_range = f'bytes {offset}-{limit}/{size}' if limit is not None else f'bytes */{size}'
    return request(session_url(url), 'PUT', token=token, data=content,
                   headers={'Content-Range': content_range, 'Content-Type': 'video/mp4'})


def received_bytes(response, size):
    received = response.headers.get('Range')
    if not received:
        return 0
    bounds = re.fullmatch(r'bytes=0-(\d+)', received)
    if not bounds or int(bounds[1]) >= size - 1:
        raise RuntimeError('YouTube에서 전송 위치를 확인할 수 없습니다. 같은 명령으로 다시 시도하세요.')
    return int(bounds[1]) + 1
