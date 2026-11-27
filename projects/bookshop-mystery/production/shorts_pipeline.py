"""Prepare a YouTube upload and its promotional assets from a rendered episode."""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from PIL import Image, ImageDraw, ImageFont, ImageOps

from youtube_upload import PRIVACY, authorized_channel, connect_channel, file_hash, upload_package

ROOT = Path(__file__).resolve().parent
ASSET = ROOT.parent / "apps/web/public/assets/last-receipt-cover.webp"
CREDENTIALS = ROOT / ".work/youtube-credentials.json"
OUTPUT = ROOT / "output/youtube"
PLAY_URL = "https://dawn.bambyul.com/"
FILES = ("short.mp4", "cover.jpg", "captions.srt")
TAGS = ("추리게임", "웹게임", "쇼츠")


def read_episode(slug):
    episodes = json.loads((ROOT / "episodes.json").read_text(encoding="utf-8"))
    for episode in episodes:
        if episode["slug"] == slug:
            return episode
    raise ValueError(f"등록된 에피소드를 찾을 수 없습니다. {slug}")


def campaign_url(url, source=None):
    target = urlsplit(url)
    if target.scheme != "https" or not target.hostname or target.username or target.password:
        raise ValueError("홍보 링크에는 로그인 정보가 없는 공개 HTTPS 주소를 입력하세요.")
    query = [(key, value) for key, value in parse_qsl(target.query, keep_blank_values=True) if key != "from"]
    if source:
        query.append(("from", source))
    return urlunsplit(target._replace(query=urlencode(query)))


def upload_plan(episode, video, play_url=None):
    title = episode["title"]
    description = episode["description"] + "\n\n" + " ".join(f"#{tag}" for tag in TAGS)
    if play_url:
        description = f"{campaign_url(play_url)}\n\n{description}"
    if not title or len(title) > 100 or len(description.encode("utf-8")) > 5000:
        raise ValueError("YouTube 제목 또는 설명 허용 길이를 확인하세요.")
    if any(mark in title + description for mark in "<>"):
        raise ValueError("YouTube 제목과 설명에는 꺾쇠를 사용할 수 없습니다.")
    return {
        "version": 1,
        "video_sha256": file_hash(video),
        "snippet": {
            "title": title,
            "description": description,
            "tags": TAGS,
            "categoryId": "20",
            "defaultLanguage": "ko",
            "defaultAudioLanguage": "ko",
        },
        "status": {"privacyStatus": "private", "containsSyntheticMedia": True},
    }


def promo_copy(episode, play_url):
    intro = episode["description"].split("\n\n", 1)[0]
    prompt = episode["comment"].split("\n\n", 1)[0]
    community_cta = (
        campaign_url(play_url, "community") if play_url else "영상 설명의 사건 주소에서 이어서 조사하세요."
    )
    return "\n".join([
        f"# {episode['title']}",
        "", "## 고정 댓글", "", episode["comment"],
        "", "## YouTube 커뮤니티", "", intro, "", "쇼츠 보기 {{shorts_url}}", "", community_cta,
        "", "## SNS", "", intro, "", prompt, "", "쇼츠 보기 {{shorts_url}}", "", community_cta,
        "", " ".join(f"#{tag}" for tag in TAGS), "",
    ])


def promo_art(episode, destination, font_path, play_url=None):
    if font_path:
        family, index = font_path, 0
    else:
        candidates = [
            (Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"), 6),
            (Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"), 1),
        ]
        installed = next(((path, face) for path, face in candidates if path.is_file()), None)
        if installed is None:
            raise ValueError("홍보 이미지에 사용할 한국어 글꼴을 --font로 지정하세요.")
        family, index = installed
    art = ASSET.parent / episode.get("coverImage", ASSET.name)
    with Image.open(art) as source:
        board = ImageOps.fit(source.convert("RGB"), (1080, 1080), centering=(0.66, 0.5))
    mask = Image.new("L", (1, 1080))
    mask.putdata([
        round(205 * max(0, 1 - row / 530) ** 0.65 + 212 * max(0, (row - 640) / 440) ** 0.8)
        for row in range(1080)
    ])
    board = Image.composite(Image.new("RGB", board.size, "#141413"), board, mask.resize(board.size))
    draw = ImageDraw.Draw(board)
    heading = ImageFont.truetype(str(family), 74, index=index)
    cta = ImageFont.truetype(str(family), 46, index=index)
    for row, line in enumerate(episode["cover"].splitlines()):
        draw.text((72, 76 + row * 83), line, font=heading, fill="#fff5e5", anchor="la")
    target = urlsplit(play_url or "")
    address = target.netloc + ("" if target.path == "/" else target.path)
    if cta.getlength(address) > 936:
        address = target.netloc
    draw.text((72, 931), address or "사건 직접 풀기", font=cta, fill="#ffc887", anchor="la")
    board.save(destination, quality=92, optimize=True)


def prepare_package(episode, source, output, play_url=None, font=None):
    play_url = campaign_url(play_url or urljoin(PLAY_URL, episode.get("casePath", "/")))
    destination = output / episode["slug"]
    if destination.exists():
        raise ValueError(f"이 패키지가 이미 있습니다. 다른 출력 폴더를 지정하세요. {destination}")
    for name in FILES:
        path = source / name
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f"제작 파일이 없습니다. {path}")
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".prep-", dir=output) as work:
        staged = Path(work) / episode["slug"]
        staged.mkdir()
        for name in FILES:
            shutil.copyfile(source / name, staged / name)
        plan = upload_plan(episode, staged / "short.mp4", play_url)
        (staged / "upload.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (staged / "promotion.md").write_text(promo_copy(episode, play_url), encoding="utf-8")
        (staged / "profile-link.txt").write_text(campaign_url(play_url, "youtube-shorts") + "\n", encoding="utf-8")
        promo_art(episode, staged / "promo-square.jpg", font, play_url)
        staged.rename(destination)
    return destination


def render_episode(options, source):
    command = [
        sys.executable, str(ROOT / "render-shorts.py"), "--episode", options.episode,
        "--renderer", options.renderer, "--output-dir", str(source),
    ]
    if options.reuse_audio:
        command.extend(["--reuse-audio", str(options.reuse_audio)])
    if options.printer_handoff:
        command.extend(["--printer-handoff", str(options.printer_handoff)])
    subprocess.run(command, check=True)


def send(package, credentials, privacy):
    from google.auth.exceptions import GoogleAuthError

    try:
        with authorized_channel(credentials) as channel:
            result = upload_package(package, privacy, channel)
    except GoogleAuthError:
        raise ValueError("YouTube 채널 인증에 실패했습니다. connect로 다시 연결하세요.") from None
    copy = (package / "promotion.md").read_text(encoding="utf-8")
    (package / "promotion-with-link.md").write_text(copy.replace("{{shorts_url}}", result["url"]), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


def parser_for_pipeline():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="영상, 업로드 정보와 홍보 파일을 패키지로 만듭니다.")
    prepare.add_argument("episode")
    prepare.add_argument("--source", type=Path, help="영상 출력 루트. 내부의 에피소드 폴더를 읽습니다.")
    prepare.add_argument("--output", type=Path, default=OUTPUT)
    prepare.add_argument("--play-url", help="에피소드에 지정된 사건 주소를 덮어쓸 공개 HTTPS 주소")
    prepare.add_argument("--font", type=Path)
    prepare.add_argument("--render", action="store_true", help="패키지 생성 전에 쇼츠를 렌더링합니다.")
    prepare.add_argument("--renderer", choices=("browser", "unity"), default="browser")
    prepare.add_argument("--reuse-audio", type=Path)
    prepare.add_argument("--printer-handoff", type=Path)
    prepare.add_argument("--upload", action="store_true", help="준비된 영상을 현재 연결된 채널에 전송합니다.")
    upload = commands.add_parser("upload", help="준비한 패키지를 연결된 채널로 보냅니다.")
    upload.add_argument("package", type=Path)
    connect = commands.add_parser("connect", help="데스크톱 OAuth로 채널을 연결합니다.")
    connect.add_argument("client", type=Path)
    for command in (prepare, upload, connect):
        command.add_argument("--credentials", type=Path, default=CREDENTIALS)
    for command in (prepare, upload):
        command.add_argument("--privacy", choices=PRIVACY, default="private")
    return parser


def main():
    options = parser_for_pipeline().parse_args()
    if options.command == "connect":
        from oauthlib.oauth2 import OAuth2Error

        try:
            connect_channel(options.client, options.credentials)
        except OAuth2Error:
            raise ValueError("브라우저의 YouTube 채널 연결을 완료하지 못했습니다.") from None
        print("YouTube 채널 연결 완료")
        return
    if options.command == "upload":
        send(options.package.resolve(), options.credentials, options.privacy)
        return
    episode = read_episode(options.episode)
    source = options.source or ROOT / ("output/rendered" if options.render else "output/revised")
    if options.render:
        render_episode(options, source.resolve())
    package = prepare_package(episode, source / episode["slug"], options.output.resolve(), options.play_url, options.font)
    print(package, flush=True)
    if options.upload:
        send(package, options.credentials, options.privacy)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as problem:
        sys.exit(str(problem))
