"""Render original fiction with the Story Studio Shorts audio and encoding pipeline."""

import argparse
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

from story_studio.media import ffmpeg
from story_studio.shorts.audio import make_mix, voice_take, RATE
from story_studio.shorts.render import capture_frames, render_cut, stamp, wrap
from story_studio.shorts.timing import Cut, FPS, FRAMES
from story_studio.shorts.verify import verify_movie
from story_studio.shorts.voice import narrate

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent / "apps/unity/Assets/Resources/Bookshop"
WEB_ASSETS = ROOT.parent / "apps/web/public/assets"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"
W, H = 1080, 1920
GOLD = "#ffc887"
CREAM = "#fff5e5"


def text(draw, xy, value, size, color=CREAM, *, bold=False, mono=False):
    font = ImageFont.truetype(MONO if mono else FONT, size, index=6 if bold and not mono else 0)
    draw.text(xy, value, font=font, fill=color, anchor="la")


def paste_fitted(board, art, rect):
    left, top, right, bottom = rect
    board.paste(ImageOps.fit(art, (right - left, bottom - top), method=Image.Resampling.LANCZOS), (left, top))


def read_image(path):
    with Image.open(path) as raw:
        return raw.convert("RGB")


def source_image(directory, key):
    return read_image(directory / (key + ".png"))


def make_board(directory, episode, shot, target, index, callout=None):
    key = shot["image"]
    substitute = {"labels": "desk", "transfer": "record", "book": "record"}
    art = shot.get("art")
    base = read_image(WEB_ASSETS / art) if art else source_image(directory, substitute.get(key, key))
    if crop := shot.get("crop"):
        base = base.crop(tuple(round(fraction * length) for fraction, length in zip(crop, base.size * 2)))
    base = ImageOps.fit(base, (W, H))
    base = ImageEnhance.Color(base).enhance(0.88)
    fade_start, fade_length, fade_opacity = (1270, 650, 228)
    if key == "receipt":
        # Lift the serial number above the spoken-caption area.
        framed = Image.new("RGB", (W, H), "#141413")
        framed.paste(base, (0, -288))
        base = framed
        fade_start, fade_length, fade_opacity = (1320, 285, 255)
    alpha = Image.new("L", (1, H))
    alpha.putdata([
        round(222 * max(0, 1 - y / 540) ** 1.05 + fade_opacity * min(1, max(0, (y - fade_start) / fade_length)) ** 0.88)
        for y in range(H)
    ])
    paint = Image.new("RGB", (W, H), "#141413")
    board = Image.composite(paint, base, alpha.resize((W, H)))
    if key == "closed":
        notice = source_image(ASSETS, "closed")
        paste_fitted(board, notice, (78, 583, 934, 1196))
    if key == "labels":
        for offset, printer, number in ((76, "printer-a", "A  MX-41"), (514, "printer-b", "B  RD-07")):
            shot_image = source_image(directory, printer).crop((80, 565, 1000, 1370))
            paste_fitted(board, shot_image, (offset, 565, offset + 409, 1071))
            draw = ImageDraw.Draw(board)
            draw.rectangle((offset, 1071, offset + 409, 1162), fill="#24201a")
            text(draw, (offset + 23, 1086), number, 52, GOLD, mono=True)
    if key == "transfer":
        draw = ImageDraw.Draw(board)
        draw.rounded_rectangle((83, 612, 954, 1160), fill="#ded0aa", outline="#c09661", width=3, radius=8)
        text(draw, (130, 654), "동명기록관  장비 이관 기록", 49, "#523527", bold=True)
        draw.line((130, 740, 903, 740), fill="#856549", width=2)
        text(draw, (130, 778), "기기  RD-07", 64, "#30251e", bold=True)
        text(draw, (130, 883), "2017.01.12 동명기록관으로 이관", 43, "#67523e")
        text(draw, (130, 984), "새벽 2시 13분  최종 거래 복원", 43, "#67523e")
    if key == "book":
        draw = ImageDraw.Draw(board)
        draw.rounded_rectangle((116, 583, 936, 1203), fill="#dfcfaa", outline="#ba925e", width=3, radius=12)
        text(draw, (163, 643), "창가의 우편함", 61, "#493321", bold=True)
        draw.line((165, 762, 880, 762), fill="#927050", width=2)
        text(draw, (164, 839), "이 동네로 돌아오면,", 53, "#674b37")
        text(draw, (164, 932), "제일 먼저 여기 들를 것.", 53, "#674b37")
    if key == "key-log":
        draw = ImageDraw.Draw(board)
        draw.rounded_rectangle((76, 670, 922, 1100), fill="#ebddc0", outline="#ac8760", width=3, radius=14)
        text(draw, (128, 724), "동명기록관 야간 일지", 54, "#34251c", bold=True)
        draw.line((128, 817, 868, 817), fill="#938068", width=2)
        text(draw, (126, 877), "03:00", 80, "#30251e", mono=True)
        text(draw, (677, 877), "R3", 80, "#30251e", mono=True)
    draw = ImageDraw.Draw(board)
    first = index == 1
    warns_spoiler = first and episode.get("spoiler")
    heading = episode["cover"] if first else shot["heading"]
    size = 88 if first else 65
    face = ImageFont.truetype(FONT, size, index=6)
    lines = wrap(heading, face, 830)
    if len(lines) > 2:
        raise ValueError(f"헤드라인을 두 줄로 줄여 주세요. {heading}")
    title_top = 207 if warns_spoiler else 152
    if warns_spoiler:
        text(draw, (79, 153), "스포일러 포함", 36, GOLD, bold=True)
    for row, line in enumerate(lines):
        text(draw, (76, title_top + row * (size + 6)), line, size, bold=True)
    if callout:
        callout_face = ImageFont.truetype(FONT, 48, index=6)
        callout_lines = wrap(callout, callout_face, 574)
        if len(callout_lines) > 2:
            raise ValueError(f"화면 안내를 두 줄로 줄여 주세요. {callout}")
        draw.rounded_rectangle((76, 1245, 700, 1338 + 54 * (len(callout_lines) - 1)), fill="#211d17", radius=12)
        for row, line in enumerate(callout_lines):
            text(draw, (101, 1263 + 54 * row), line, 48, GOLD, bold=True)
    if index == 4 and not episode.get("spoiler") and not shot.get("callout"):
        draw.rounded_rectangle((76, 1255, 641, 1350), fill="#211d17", radius=12)
        text(draw, (102, 1272), "프로필에서 직접 조사하기", 49, GOLD, bold=True)
    board.save(target)


def take_for(data, cache, scratch, shot, index, speaker):
    path = narrate(data, cache, shot["voice"], speaker)
    seconds = len(voice_take(path, scratch / f"check-{index}.wav")) / RATE
    if 1.1 <= seconds <= shot["seconds"] - 0.15:
        return path, round(seconds, 2)
    raise ValueError(f"대사 {index}의 원속도 읽기가 편집 범위에 맞지 않습니다.")


def srt_frame(value):
    hours, minutes, seconds, millis = map(int, re.split("[:,]", value))
    return round((hours * 3600 + minutes * 60 + seconds + millis / 1000) * FPS)


def reuse_tracks(episode, original, destination):
    edit = json.loads((original / "edit.json").read_text(encoding="utf-8"))
    takes = edit["cuts"]
    if [take["text"] for take in takes] != [shot["voice"] for shot in episode["shots"]]:
        raise ValueError("기존 내레이션과 컷 대사가 다릅니다.")
    cuts = [Cut(take["first_frame"], take["frames"], take["duration_seconds"]) for take in takes]
    spans = []
    for block in (original / "captions.srt").read_text(encoding="utf-8").strip().split("\n\n"):
        _, timing, *lines = block.splitlines()
        start, end = (srt_frame(value) for value in timing.split(" --> "))
        spans.append((start, end, "\n".join(lines)))
    sections = [[span for span in spans if cut.first <= span[0] < span[1] <= cut.first + cut.frames] for cut in cuts]
    if edit["fps"] != FPS or sum(cut.frames for cut in cuts) != FRAMES or sum(map(len, sections)) != len(spans):
        raise ValueError("기존 프레임과 자막 시점을 확인해 주세요.")
    for name in ("narration.wav", "music.wav", "mix.wav"):
        shutil.copyfile(original / name, destination / name)
    return cuts, edit["music"], sections, takes


def make_short(episode, data, captures, renderer, speaker, output, original=None, printer_handoff=None):
    cache = ROOT / ".work/voice"
    cache.mkdir(parents=True, exist_ok=True)
    destination = output / episode["slug"]
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="episode-", dir=ROOT / ".work") as work:
        scratch = Path(work)
        source = scratch / "source"
        (source / "frames").mkdir(parents=True)
        (source / "assets").mkdir()
        (destination / "assets").mkdir(exist_ok=True)
        if printer_handoff:
            shutil.copyfile(printer_handoff, destination / "assets/printer-handoff.mp4")
        turn = captures / "turn"
        if turn.is_dir() and episode["slug"] == "01-receipt":
            ffmpeg(
                "-framerate", 15, "-i", turn / "%03d.jpeg", "-vf", "fps=30",
                "-c:v", "libx264", "-crf", 19, "-pix_fmt", "yuv420p", "-an",
                destination / "assets/turn.mp4",
            )
        shots, takes, reveal_points = [], [], []
        for index, shot in enumerate(episode["shots"], 1):
            artwork = [(0, None)]
            if callout := shot.get("callout"):
                label = callout["text"]
                if callout.get("includeCasePath"):
                    label += "\n" + episode["casePath"]
                artwork.append((callout["from"], label))
                if "to" in callout:
                    artwork.append((callout["to"], None))
            reveal_points.append([at for at, _ in artwork[1:]])
            for variant, (_, label) in enumerate(artwork):
                name = f"{index}.png" if variant == len(artwork) - 1 else f"{index}-{variant}.png"
                make_board(captures, episode, shot, source / "frames" / name, index, label)
            style = {
                **shot, "head": shot["heading"],
                "camera": "push",
                "credit": "",
            }
            if original is None:
                voice, duration = take_for(data, cache, scratch, shot, index, speaker)
                recording = f"assets/take-{index}.wav"
                shutil.copyfile(voice, source / recording)
                style["recording"] = recording
                takes.append({"speaker": speaker, "duration_seconds": duration, "text": shot["voice"]})
            if index == 4 and (destination / "assets/turn.mp4").is_file():
                style["media"] = {"file": "assets/turn.mp4", "box": [76, 596, 864, 576]}
            if index == len(episode["shots"]) and printer_handoff:
                style["media"] = {"file": "assets/printer-handoff.mp4", "box": [76, 350, 864, 244]}
            shots.append(style)
        musical = {
            "theme": "cobalt",
            "tonic": 45,
            "shots": shots,
            "music": [
                {"at": 0, "mode": "tap", "note": "첫 단서"},
                {"at": 6, "mode": "pulse", "note": "폐점 안내나 두 번째 단서"},
                {"at": 13, "mode": "silence", "note": "라벨과 날짜 읽기"},
                {"at": 20, "mode": "resolve", "note": "마지막 질문 또는 해설"},
            ],
        }
        if original is None:
            cuts, cues, captions = make_mix(musical, source, destination, scratch, data, cache)
        else:
            cuts, cues, captions, takes = reuse_tracks(episode, original, destination)
        if any(reveal_points):
            (source / "frames/reveals.json").write_text(json.dumps(reveal_points), encoding="utf-8")
        points = capture_frames(source, destination, len(cuts))
        parts = [
            render_cut(index, shot, cut, marks, spans, destination, scratch)
            for index, (shot, cut, marks, spans) in enumerate(zip(shots, cuts, points, captions), 1)
        ]
        list_path = scratch / "parts.txt"
        list_path.write_text("".join(f"file '{part.name}'\n" for part in parts))
        ffmpeg(
            "-f", "concat", "-safe", 1, "-i", list_path, "-i", destination / "mix.wav",
            "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
            "-t", 30, "-metadata", "title=" + episode["title"], "-movflags", "+faststart",
            destination / "short.mp4",
        )
    verify_movie(destination / "short.mp4")
    srt = []
    for spans in captions:
        for first, after, line in spans:
            srt.extend([str(len(srt) // 4 + 1), f"{stamp(first)} --> {stamp(after)}", line, ""])
    (destination / "captions.srt").write_text("\n".join(srt) + "\n", encoding="utf-8")
    publish = [
        "# " + episode["title"], "", "## 설명", "", episode["description"], "",
        "#추리게임 #웹게임", "", "## 고정 댓글", "", episode["comment"],
        "", "## 표지 문구", "", episode["cover"], "",
    ]
    (destination / "publish.md").write_text("\n".join(publish), encoding="utf-8")
    (destination / "edit.json").write_text(json.dumps({
        "capture": renderer, "fps": 30, "music": cues,
        "cuts": [{"first_frame": cut.first, "frames": cut.frames, **take} for cut, take in zip(cuts, takes)],
    }, ensure_ascii=False, indent=2) + "\n")
    print(episode["slug"], "1080×1920, 900 frames, 30s", [take["speaker"] for take in takes], flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--renderer", choices=("browser", "unity"), default="browser")
    parser.add_argument("--episode")
    parser.add_argument("--speaker", choices=("F2", "sohee-playful"), default="F2")
    parser.add_argument("--reuse-audio", type=Path, help="기존 편집 폴더의 음성, 반주, 자막 시점을 사용합니다.")
    parser.add_argument("--printer-handoff", type=Path, help="프린터 편 마지막 컷에 넣을 타임라인 영상")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output")
    options = parser.parse_args()
    data = None if options.reuse_audio else Path(os.environ["STORY_STUDIO_DATA_DIR"])
    capture = ROOT / ".work" / (options.renderer + "-capture")
    output = options.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for episode in json.loads((ROOT / "episodes.json").read_text()):
        if not options.episode or episode["slug"] == options.episode:
            with tempfile.TemporaryDirectory(prefix=".short-", dir=output) as staging:
                original = options.reuse_audio / episode["slug"] if options.reuse_audio else None
                handoff = options.printer_handoff if episode["slug"] == "02-printers" else None
                make_short(episode, data, capture, options.renderer, options.speaker, Path(staging), original, handoff)
                target = output / episode["slug"]
                if target.exists():
                    raise FileExistsError(f"기존 출력이 있습니다. 다른 위치에 보관하세요. {target}")
                (Path(staging) / episode["slug"]).rename(target)


if __name__ == "__main__":
    main()
