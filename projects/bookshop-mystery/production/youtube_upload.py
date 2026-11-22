"""Authorize the channel and upload a prepared Short with a recoverable session."""

import fcntl
import hashlib
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit

from requests.exceptions import RequestException

SCOPE = "https://www.googleapis.com/auth/youtube.upload"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
PRIVACY = ("private", "unlisted", "public")
RETRYABLE = {429, 500, 502, 503, 504}
TIMEOUT = (10, 90)
STATE_FILE = ".youtube-upload.json"


def write_private_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as scratch:
        temporary = Path(scratch.name)
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def connect_channel(client_path, credentials_path):
    from google_auth_oauthlib.flow import InstalledAppFlow

    client_config = json.loads(client_path.read_text(encoding="utf-8"))
    if "installed" not in client_config:
        raise ValueError("Google Cloud에서 받은 데스크톱 앱 OAuth 클라이언트 JSON을 사용하세요.")
    flow = InstalledAppFlow.from_client_config(client_config, [SCOPE], autogenerate_code_verifier=True)
    credentials = flow.run_local_server(
        host="127.0.0.1",
        port=0,
        authorization_prompt_message=None,
        success_message="채널 연결이 완료되었습니다. 터미널로 돌아가세요.",
        timeout_seconds=300,
        access_type="offline",
        prompt="consent",
    )
    if not credentials.refresh_token:
        raise ValueError("YouTube 갱신 토큰을 받지 못했습니다. 채널 연결을 다시 시도하세요.")
    write_private_json(credentials_path, json.loads(credentials.to_json()))


def authorized_channel(path):
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2.credentials import Credentials

    if not path.is_file():
        raise ValueError("YouTube 채널 연결이 필요합니다. connect 명령으로 연결하세요.")
    # The upload body is a seeked file stream. Resume it explicitly after an HTTP failure.
    return AuthorizedSession(Credentials.from_authorized_user_file(str(path), [SCOPE]), max_refresh_attempts=0)


def file_hash(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


@contextmanager
def package_lock(package):
    fd = os.open(package / ".youtube-upload.lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("이 패키지의 업로드가 이미 실행 중입니다.") from None
        yield


def request_retrying(send):
    for delay in (0, 1, 2, 4):
        if delay:
            time.sleep(delay)
        try:
            response = send()
        except RequestException:
            continue
        if response.status_code not in RETRYABLE:
            return response
    raise ValueError("YouTube 응답을 받지 못했습니다. 같은 패키지로 upload를 다시 실행하세요.")


def response_error(response):
    reason = ""
    try:
        details = response.json().get("error", {}).get("errors", [])
        if details:
            code = details[0].get("reason", "")
            if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{1,60}", code):
                reason = f" ({code})"
    except (AttributeError, TypeError, ValueError):
        pass
    return ValueError(f"YouTube가 업로드 요청을 거절했습니다. HTTP {response.status_code}{reason}")


def session_url(location):
    url = urlsplit(location)
    if (
        url.scheme != "https"
        or url.netloc != "www.googleapis.com"
        or url.path != "/upload/youtube/v3/videos"
        or not url.query
        or url.fragment
    ):
        raise ValueError("YouTube가 올바른 재개 주소를 반환하지 않았습니다.")
    return location


def start_session(channel, metadata, size):
    response = request_retrying(lambda: channel.post(
        UPLOAD_URL,
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={"X-Upload-Content-Length": str(size), "X-Upload-Content-Type": "video/mp4"},
        json=metadata,
        timeout=TIMEOUT,
        allow_redirects=False,
    ))
    if response.status_code != 200:
        raise response_error(response)
    return session_url(response.headers.get("Location", ""))


def completed_video(response):
    video = response.json()
    video_id = video.get("id", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("YouTube 완료 응답에 영상 ID가 없습니다. Studio에서 업로드 여부를 확인하세요.")
    return {
        "video_id": video_id,
        "url": f"https://www.youtube.com/shorts/{video_id}",
        "studio_url": f"https://studio.youtube.com/video/{video_id}/edit",
        "privacy": video.get("status", {}).get("privacyStatus"),
    }


def uploaded_range(response, size):
    if response.status_code == 404:
        raise ValueError("업로드 세션이 만료됐습니다. 중복 업로드를 피하려면 Studio에서 먼저 처리 결과를 확인하세요.")
    if response.status_code != 308:
        raise response_error(response)
    received = response.headers.get("Range")
    if not received:
        return 0
    match = re.fullmatch(r"bytes=0-(\d+)", received)
    if not match or int(match[1]) + 1 >= size:
        raise ValueError("YouTube가 올바른 업로드 범위를 반환하지 않았습니다.")
    return int(match[1]) + 1


def transfer(channel, location, video, size, resume):
    offset = 0
    for delay in (0, 1, 2, 4):
        if delay:
            time.sleep(delay)
        if resume or delay:
            result = request_retrying(lambda: channel.put(
                location,
                data=b"",
                headers={"Content-Range": f"bytes */{size}", "Content-Length": "0"},
                timeout=TIMEOUT,
                allow_redirects=False,
            ))
            if result.status_code in (200, 201):
                return completed_video(result)
            offset = uploaded_range(result, size)
        with video.open("rb") as source:
            source.seek(offset)
            try:
                result = channel.put(
                    location,
                    data=source,
                    headers={
                        "Content-Type": "video/mp4",
                        "Content-Length": str(size - offset),
                        "Content-Range": f"bytes {offset}-{size - 1}/{size}",
                    },
                    timeout=TIMEOUT,
                    allow_redirects=False,
                )
            except RequestException:
                continue
        if result.status_code in (200, 201):
            return completed_video(result)
        if result.status_code != 308 and result.status_code not in RETRYABLE:
            if result.status_code == 404:
                uploaded_range(result, size)
            raise response_error(result)
    raise ValueError("업로드가 중단됐습니다. 같은 패키지로 upload를 다시 실행하면 이어서 보냅니다.")


def upload_package(package, privacy, channel):
    if privacy not in PRIVACY:
        raise ValueError("공개 범위는 private, unlisted, public 중에서 선택하세요.")
    video = package / "short.mp4"
    plan = json.loads((package / "upload.json").read_text(encoding="utf-8"))
    if plan.get("version") != 1 or plan.get("video_sha256") != file_hash(video):
        raise ValueError("영상이 준비 이후 변경됐습니다. 새 패키지를 만들어 주세요.")
    metadata = {
        "snippet": plan["snippet"],
        "status": {**plan["status"], "privacyStatus": privacy},
    }
    fingerprint = hashlib.sha256(
        json.dumps([plan["video_sha256"], metadata], sort_keys=True).encode()
    ).hexdigest()
    size = video.stat().st_size
    state_path = package / STATE_FILE
    with package_lock(package):
        resume = state_path.is_file()
        if resume:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if state.get("fingerprint") != fingerprint:
                raise ValueError("기존 업로드와 영상, 문구 또는 공개 범위가 다릅니다. Studio에서 확인하세요.")
            if "result" in state:
                return state["result"]
            location = session_url(state["session"])
        if not resume:
            location = start_session(channel, metadata, size)
            write_private_json(state_path, {"fingerprint": fingerprint, "session": location})
        result = transfer(channel, location, video, size, resume)
        write_private_json(state_path, {"fingerprint": fingerprint, "result": result})
        return result
