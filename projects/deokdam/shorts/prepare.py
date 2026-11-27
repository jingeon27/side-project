"""Build a Story Studio episode folder using the web card and an original storyboard."""

import argparse
import json
from html import escape
from pathlib import Path
import shutil
import subprocess
import tempfile

SHORTS = Path(__file__).resolve().parent
PROJECT = SHORTS.parent
WEB = PROJECT / 'apps/web'
CARDS = WEB / 'src/shared/episodes.json'


def read_json(path):
    return json.loads(path.read_text(encoding='utf8'))


def letter_content(insert):
    if not insert.get('typed'):
        return escape(insert['text'])
    words = insert['text'].split()
    return ' '.join(
        f'<span data-from="{insert.get("from", 0.12) + 0.04 + index * 0.044:.2f}">{escape(word)}</span>'
        for index, word in enumerate(words)
    )


def board(shot, artwork, title, intro, clip):
    focus_x, focus_y = shot.get('focus', (.5, .5))
    appearance = f' style="--focus-x:{focus_x * 100:.1f}%;--focus-y:{focus_y * 100:.1f}%"'
    transparent = ' data-transparent' if clip else ''
    picture = '' if clip else f'<img class="picture" src="{artwork}" alt="">'
    opening = ''
    if intro:
        heading = 'intro multiline' if '\n' in intro else 'intro'
        opening = (f'<div class="series">덕담집 <span>창작 상황극</span></div>'
                   f'<h1 class="{heading}">{escape(intro)}</h1>')
    detail = ''
    if insert := shot.get('insert'):
        reveal = f' data-from="{float(insert["from"])}"' if 'from' in insert else ''
        end = insert.get('until', shot.get('endcard'))
        hide = f' data-until="{float(end)}"' if end is not None else ''
        label = f'<span class="insert-label">{escape(insert["label"])}</span>' if 'label' in insert else ''
        detail = f'<div class="insert {escape(insert["kind"])}"{reveal}{hide}>{label}{letter_content(insert)}</div>'
    card = ''
    if 'endcard' in shot:
        card = (f'<aside class="card-link" data-from="{float(shot["endcard"])}">'
                '<img class="card-image" src="assets/web-card.png" alt="">'
                f'<div class="card-destination">〈{escape(title)}〉 <span>프로필에서 열기</span></div></aside>')
    return f'''<section class="shot" data-shot{transparent}{appearance}>
{picture}<div class="shade"></div>
{opening}{detail}{card}
</section>'''


def prepare(slug, site_url, output, motion_dir=None):
    cards = {card['slug']: card for card in read_json(CARDS)}
    stories = read_json(SHORTS / 'storylines.json')
    if slug not in stories or slug not in cards:
        raise ValueError('웹 카드와 대본이 모두 있는 회차를 선택하세요.')
    card = cards[slug]
    story = stories[slug]
    motion_clips = {}
    if motion_dir is not None:
        motion_clips = {
            index: motion_dir / f'{index + 1:02}.mp4'
            for index, shot in enumerate(story['shots']) if 'motion' in shot
        }
        if not motion_clips:
            raise ValueError('움직임 지시가 있는 회차를 선택하세요.')
        for clip in motion_clips.values():
            if not clip.is_file() or clip.stat().st_size == 0:
                raise FileNotFoundError(f'먼저 이 컷을 생성하세요. {clip}')
    if output.exists():
        raise FileExistsError(f'이미 준비한 회차 폴더입니다. 새 경로를 선택하세요. {output}')

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='deokdam-', dir=output.parent) as temporary:
        folder = Path(temporary) / slug
        folder.mkdir()
        assets = folder / 'assets'
        assets.mkdir()
        subprocess.run(['node', str(WEB / 'scripts/capture-card.ts'), slug, site_url, str(assets / 'web-card.png')],
                       cwd=WEB, check=True)
        panels = []
        shots = []
        copied_art = set()
        for index, shot in enumerate(story['shots']):
            artwork = f'{slug}-{shot["art"]}.webp'
            if artwork not in copied_art:
                shutil.copyfile(SHORTS / 'art' / artwork, assets / artwork)
                copied_art.add(artwork)
            clip = None
            if index in motion_clips:
                filename = f'motion-{index + 1:02}.mp4'
                shutil.copyfile(motion_clips[index], assets / filename)
                clip = {'file': 'assets/' + filename, 'box': [0, 0, 1080, 1920], 'fit': 'cover',
                        'layer': 'background', 'focus': shot.get('focus', [.5, .5])}
                if 'trimEnd' in shot['motion']:
                    clip['trimEnd'] = shot['motion']['trimEnd']
            intro = story.get('intro', story['cover']) if index == 0 else None
            panels.append(board(shot, 'assets/' + artwork, card['title'], intro, clip))
            fields = ('seconds', 'voice', 'caption', 'visual', 'speaker', 'voiceTake', 'voiceLead')
            planned = {**{key: shot[key] for key in fields if key in shot}, 'head': shot['heading']}
            if clip:
                planned['media'] = clip
            shots.append(planned)
        shutil.copyfile(SHORTS / 'boards.css', assets / 'boards.css')
        markup = ('<!doctype html><html lang="ko"><meta charset="utf-8">'
                  '<link rel="stylesheet" href="assets/boards.css"><body>'
                  + '\n'.join(panels) + '</body></html>')
        (folder / 'boards.html').write_text(markup, encoding='utf8')
        episode = {
            'kind': 'original', 'slug': slug, 'title': card['title'], 'cardPath': '/cards/' + slug,
            'series': '덕담집', 'theme': 'cobalt', 'tonic': story['tonic'], 'narrator': story['narrator'],
            'cover': story['cover'], 'description': card['hook'] + '\n\n덕담집 창작 상황극이에요. '
            + '오늘의 덕은 ‘' + card['action'] + '’예요. 채널 프로필에서 〈' + card['title'] + '〉 카드를 열어보세요.',
            'comment': '〈' + card['title'] + '〉 카드는 채널 프로필에서 열 수 있어요.',
            'credits': '덕담집 창작 시나리오, ImageGen 삽화, VoxCPM2 한국어 가상 화자, Story Studio 반주.'
            + (' 원화 영상화 Story Studio와 Wan2.2.' if motion_clips else ''),
            'sources': [], 'tags': ['덕담집', '오늘의덕', {'job': '취업준비', 'parent': '자녀응원', 'admission': '대입준비'}[card['topic']]],
            'shots': shots,
            'music': story['music'],
        }
        (folder / 'episode.json').write_text(json.dumps(episode, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        # Only move the complete input folder into place.
        folder.rename(output)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('slug')
    parser.add_argument('--site', default='http://127.0.0.1:3460')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--motion-dir', type=Path, help='animate.py로 만든 회차별 MP4 폴더')
    args = parser.parse_args()
    print(prepare(args.slug, args.site, args.output or PROJECT / '.data/shorts/inputs' / args.slug,
                  args.motion_dir))


if __name__ == '__main__':
    main()
