"""Capture full-bleed boards and cut the film on the native-speed reading."""
from functools import lru_cache
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from ..media import ffmpeg
from .audio import make_mix
from .timing import FPS, LEAD
from .verify import verify_movie
from .voice import speaker_for

SIZE = (1080, 1920)
LEGACY = (960, 900)


@lru_cache(maxsize=32)
def font(size, bold=False):
    from PIL import ImageFont
    candidates = [os.environ.get('SHORTS_FONT'), '/System/Library/Fonts/AppleSDGothicNeo.ttc',
                  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']
    for candidate in filter(None, candidates):
        if Path(candidate).is_file():
            index = 6 if bold and candidate.endswith('AppleSDGothicNeo.ttc') else 0
            return ImageFont.truetype(candidate, size, index=index)
    raise OSError('한글 폰트 파일을 SHORTS_FONT로 지정하세요.')


def wrap(text, face, width):
    lines = []
    for paragraph in text.splitlines():
        line = ''
        for word in paragraph.split():
            if face.getlength(word) > width:
                raise ValueError(f'한 단어가 화면 너비를 넘습니다: {word}')
            if line and face.getlength(line + ' ' + word) > width:
                lines.append(line)
                line = ''
            line = (line + ' ' + word).strip()
        lines.append(line)
    return lines


def overlay(shot, caption):
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', SIZE)
    pen = ImageDraw.Draw(img)
    for size in (55, 50, 45, 41):
        face = font(size, True)
        lines = wrap(caption, face, 845)
        if len(lines) <= 2:
            break
    if len(lines) > 2:
        raise ValueError('자막을 짧은 호흡 단위로 줄바꿈해 주세요.')
    for row, line in enumerate(lines):
        y = 1530 - (len(lines)-1-row) * 72
        pen.text((503, y+3), line, font=face, fill=(0, 0, 0, 166), anchor='mm',
                 stroke_width=5, stroke_fill=(0, 0, 0, 116))
        pen.text((503, y), line, font=face, fill='#fffaf3', anchor='mm',
                 stroke_width=2, stroke_fill=(20, 18, 16, 238))
    credit = shot.get('credit')
    if credit:
        if font(23).getlength(credit) > 865:
            raise ValueError('화면에 넣을 출처를 한 줄로 줄여 주세요.')
        pen.text((77, 1652), credit, font=font(23), fill='#ddd9cd', anchor='lm', stroke_width=1,
                 stroke_fill=(12, 11, 10, 190))
    return img


def artwork(path, dest, shot):
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps
    with Image.open(path) as source:
        if source.size == SIZE:
            shutil.copyfile(path, dest)
            return
        if source.size != LEGACY:
            raise ValueError('보드는 1080 × 1920 또는 960 × 900 PNG로 저장하세요.')
        # Keep every corner of old illustrations visible inside the portrait master.
        art = source.convert('RGB')
        base = ImageEnhance.Brightness(ImageOps.fit(art, SIZE).filter(ImageFilter.GaussianBlur(48))).enhance(.28)
        base.paste(art, (60, 441))
        pen = ImageDraw.Draw(base)
        for i, line in enumerate(wrap(shot['head'], font(61, True), 890)):
            pen.text((74, 205 + 78*i), line, font=font(61, True), fill='#fff9ef', anchor='la')
        base.save(dest)


def capture_frames(source, dest, count):
    frames = dest / 'frames'
    if (source / 'boards.html').is_file():
        shutil.copy2(source / 'boards.html', dest)
        args = [os.environ['SHORTS_NODE'], os.environ['SHORTS_SCRIPT'], 'boards', str(dest / 'boards.html'), str(frames)]
        subprocess.run(args, check=True)
    else:
        frames.mkdir()
        for path in (source / 'frames').glob('*.png'):
            shutil.copyfile(path, frames / path.name)
        reveals = source / 'frames/reveals.json'
        if reveals.is_file():
            shutil.copy2(reveals, frames)
    if {p.name for p in frames.glob('*.png') if p.stem.isdecimal()} != {f'{i+1}.png' for i in range(count)}:
        raise ValueError('대본 컷 수와 캡처한 보드 수가 다릅니다.')
    manifest = frames / 'reveals.json'
    points = json.loads(manifest.read_text()) if manifest.exists() else [[] for _ in range(count)]
    if not isinstance(points, list) or len(points) != count:
        raise ValueError('보드 표시 시점의 컷 수가 다릅니다.')
    for row in points:
        if (not isinstance(row, list) or len(row) > 16
                or any(type(t) not in (float, int) or not 0 < t < 1 for t in row) or sorted(set(row)) != row):
            raise ValueError('보드 표시 시점은 컷 안에서 오름차순이어야 합니다.')
    return points


def playlist(scratch, name, events, frames):
    # The PNG demuxer defaults to 25 fps. Give it the timeline timebase before rounding timestamps.
    indexed = dict(events)
    starts = sorted(indexed)
    if not starts or starts[0] != 0 or starts[-1] >= frames:
        raise ValueError('컷 안의 그림이나 자막 시점을 확인하세요.')
    lines = ['ffconcat version 1.0']
    for a, b in zip(starts, [*starts[1:], frames]):
        lines += [f"file '{indexed[a].name}'", f'option framerate {FPS}', f'duration {(b-a)/FPS:.9f}']
    lines += [f"file '{indexed[starts[-1]].name}'", f'option framerate {FPS}']
    path = scratch / (name + '.txt')
    path.write_text('\n'.join(lines) + '\n')
    return path


def render_cut(i, shot, cut, points, captions, output, scratch):
    from PIL import Image
    media = shot.get('media')
    behind_board = media is not None and media.get('layer') == 'background'
    art_events = []
    for step, at in enumerate([0, *points]):
        filename = f'{i}.png' if step == len(points) else f'{i}-{step}.png'
        plate = scratch / f'art-{i}-{step}.png'
        artwork(output / 'frames' / filename, plate, shot)
        art_events.append((min(cut.frames - 1, round(at * cut.frames)), plate))
    blank = scratch / f'caption-{i}-blank.png'
    overlay(shot, '').save(blank)
    if i == 1 and not behind_board:
        with Image.open(art_events[0][1]) as art, Image.open(blank) as ink:
            Image.alpha_composite(art.convert('RGBA'), ink).convert('RGB').save(output / 'cover.jpg', quality=91)
    caption_events = [(0, blank)]
    to_burn = [] if shot.get('sourceComment', {}).get('shownAsCaption') else captions
    for k, (first, after, line) in enumerate(to_burn):
        plate = scratch / f'caption-{i}-{k}.png'
        overlay(shot, line).save(plate)
        caption_events.append((first - cut.first, plate))
        if after < cut.first + cut.frames:
            caption_events.append((after - cut.first, blank))
    art_list = playlist(scratch, f'art-{i}', art_events, cut.frames)
    text_list = playlist(scratch, f'text-{i}', caption_events, cut.frames)
    move = ''
    if shot.get('camera') == 'push':
        move = (f",scale=1440:2560,zoompan=z='1+0.026*on/{max(1, cut.frames-1)}':"
                f"x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps={FPS}")
    alpha = ',format=rgba' if behind_board else ''
    graph = f'[0:v]fps={FPS}{move},setsar=1{alpha}[art];[1:v]fps={FPS},format=rgba[ink];'
    media_input = []
    background = 'art'
    if media:
        x, y, width, height = media['box']
        media_input = ['-i', output / media['file']]
        if media.get('fit') == 'cover':
            focus_x, focus_y = media.get('focus', (.5, .5))
            fit = (f'scale={width}:{height}:force_original_aspect_ratio=increase,'
                   f'crop={width}:{height}:(iw-ow)*{focus_x}:(ih-oh)*{focus_y}')
        else:
            fit = (f'scale={width}:{height}:force_original_aspect_ratio=decrease,'
                   f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2')
        trim = f"trim=duration={media['trimEnd']}," if 'trimEnd' in media else ''
        hold = f',tpad=stop_mode=clone:stop={cut.frames}' if behind_board else ''
        graph += f'[2:v]{trim}setpts=PTS-STARTPTS,fps={FPS},{fit},setsar=1{hold}[clip];'
        if behind_board:
            graph += '[clip][art]overlay=format=auto[withclip];'
        else:
            graph += f'[art][clip]overlay={x}:{y}:eof_action=pass:repeatlast=0[withclip];'
        background = 'withclip'
    graph += f'[{background}][ink]overlay=0:0:format=auto,format=yuv420p[film]'
    part = scratch / f'{i}.mp4'
    ffmpeg('-f', 'concat', '-safe', 0, '-i', art_list, '-f', 'concat', '-safe', 0, '-i', text_list, *media_input,
           '-filter_complex_threads', 1, '-filter_complex', graph, '-map', '[film]', '-frames:v', cut.frames,
           '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', 18, part)
    if i == 1 and behind_board:
        ffmpeg('-i', part, '-frames:v', 1, '-q:v', 2, output / 'cover.jpg')
    return part


def stamp(frame):
    ms = round(frame / FPS * 1000)
    return f'00:00:{ms//1000:02},{ms%1000:03}'


def export_text(episode, dest, cuts, cues, captions):
    original = episode.get('kind') == 'original'
    if original:
        context = f'창작 상황극. 웹 카드 경로 `{episode["cardPath"]}`.'
    else:
        context = f'실베 등록일 {episode["lead"]["published"]}  ·  [게시물]({episode["lead"]["url"]})'
    timeline = [f'# {episode["title"]}', '', context, '', '## 컷과 내레이션', '']
    subtitles, timing = [], []
    for i, (shot, cut, spans) in enumerate(zip(episode['shots'], cuts, captions), 1):
        timeline += [f'### {cut.start:.2f}–{cut.end:.2f}초', '', shot.get('voice', '대사 없이 진행'), '', shot['visual'],
                     '', f'[편집용 컷 {i}](frames/{i}.png)', '']
        for first, after, line in spans:
            subtitles += [str(len(subtitles)//4 + 1), f'{stamp(first)} --> {stamp(after)}', line, '']
        speaker = speaker_for(episode, shot)
        if 'sourceComment' in shot:
            comment = shot['sourceComment']
            anchor = episode['lead']['url'].split('#')[0] + '#' + comment['anchor']
            timeline += [f'원문 댓글 {comment["time"]} · {speaker} 대독 · [게시 위치]({anchor}) · [캡처]({comment["capture"]})', '']
        timings = dict(firstFrame=cut.first, frames=cut.frames)
        if cut.speech_seconds:
            start = cut.start + shot.get('voiceLead', LEAD)
            timings.update(speaker=speaker, voiceStart=round(start, 4), voiceEnd=round(start + cut.speech_seconds, 4))
        timing.append(timings)
    timeline += ['## 음악 큐', ''] + [f'- {cue["at"]:.2f}초  {cue["note"]}' for cue in cues]
    sources = [f'- [{s["label"]}]({s["url"]})' for s in episode['sources']]
    if not original and all(s['url'] != episode['lead']['url'] for s in episode['sources']):
        sources.append(f'- [소재를 찾은 실베 글]({episode["lead"]["url"]})')
    publish = [f'# {episode["title"]}', '', '## 설명', '', episode['description'], '', *sources,
               '', episode['credits'], '',
               ' '.join('#' + tag for tag in episode['tags']), '', '## 고정 댓글', '', episode['comment'],
               '', '## 표지 문구', '', episode['cover']]
    if original:
        publish += ['', '## 채널 프로필 링크의 도착 경로', '', f'`{episode["cardPath"]}?utm_source=youtube`', '',
                    '공개 웹 주소를 연결한 뒤 휴대폰에서 영상과 같은 카드가 열리는지 확인합니다.',
                    '', '## YouTube AI 사용 공개', '',
                    'AI로 만든 화면과 한국어 합성 음성을 사용한 편입니다. 업로드 시 AI 사용 항목을 확인합니다.']
    (dest / 'timeline.md').write_text('\n'.join(timeline) + '\n', encoding='utf8')
    (dest / 'captions.srt').write_text('\n'.join(subtitles) + '\n', encoding='utf8')
    (dest / 'publish.md').write_text('\n'.join(publish) + '\n', encoding='utf8')
    (dest / 'edit.json').write_text(json.dumps({'fps': FPS, 'cuts': timing, 'music': cues}, ensure_ascii=False, indent=2)+'\n')


def render_film(folder, episode, output, data, cache):
    if (folder / 'assets').is_dir():
        shutil.copytree(folder / 'assets', output / 'assets')
    with tempfile.TemporaryDirectory(dir=output) as scratch:
        scratch = Path(scratch)
        cuts, cues, captions = make_mix(episode, folder, output, scratch, data, cache)
        points = capture_frames(folder, output, len(cuts))
        parts = [render_cut(i, shot, cut, marks, spans, output, scratch) for i, (shot, cut, marks, spans)
                 in enumerate(zip(episode['shots'], cuts, points, captions), 1)]
        listing = scratch / 'parts.txt'
        listing.write_text(''.join(f"file '{part.name}'\n" for part in parts))
        ffmpeg('-f', 'concat', '-safe', 1, '-i', listing, '-i', output / 'mix.wav', '-map', '0:v',
               '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', 30,
               '-metadata', 'title=' + episode['title'], '-movflags', '+faststart',
               output / 'short.mp4')
    verify_movie(output / 'short.mp4')
    export_text(episode, output, cuts, cues, captions)
    (output / 'episode.json').write_text(json.dumps(episode, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
