import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from .edition import archive, read_episode, run_day
from .voice import PRESENTER, SPEAKER, narrate, speaker_for


def candidate(root, slug, number, mobile=False):
    folder = root / 'inbox' / slug
    folder.mkdir(parents=True)
    address = (f'https://m.dcinside.com/board/dcbest/{number}' if mobile else
               f'https://gall.dcinside.com/board/view/?id=dcbest&no={number}&page=1')
    shot = dict(seconds=30, head='첫 장면', voice='대사', caption='자막', visual='컷', credit='자체 제작')
    document = dict(slug=slug, title='다큐', series='수첩', description='설명', cover='표지', credits='제작', comment='질문',
                    theme='cobalt', tags=['다큐'], tonic=50, sources=[dict(url='https://example.org/source', label='시험 자료')],
                    lead=dict(url=address, title='글', published='2026-11-21'), shots=[shot],
                    music=[dict(at=0, mode='silence', note='정적')])
    (folder / 'episode.json').write_text(json.dumps(document))
    return folder


def finished(_folder, episode, destination):
    (destination / 'short.mp4').write_bytes(b'test')
    (destination / 'episode.json').write_text(json.dumps(episode))


class DailyEditionTest(unittest.TestCase):
    def test_another_take_keeps_the_same_voice_and_can_be_replayed_from_cache(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with patch('story_studio.shorts.voice.mlx_take') as synth:
                def save(_data, _folder, dest, _text, _ref, _seed):
                    dest.touch()
                    return dest
                synth.side_effect = save
                first = narrate(root, root, '한 문장', 'ko-casual-male')
                second = narrate(root, root, '한 문장', 'ko-casual-male', take=2)
                self.assertNotEqual(first, second)
                self.assertEqual(second, narrate(root, root, '한 문장', 'ko-casual-male', take=2))
                a, b = (call.args for call in synth.call_args_list)
                self.assertEqual(a[-2], b[-2])
                self.assertTrue(a[-2].is_file())
                self.assertNotEqual(a[-1], b[-1])

    def test_retake_settings_follow_the_reader_of_the_individual_shot(self):
        with TemporaryDirectory() as directory:
            folder = candidate(Path(directory), 'retake', 128)
            manifest = folder / 'episode.json'
            data = json.loads(manifest.read_text())
            data['narrator'] = 'ko-casual-male'
            shot = data['shots'][0]
            shot['voiceTake'] = 2
            manifest.write_text(json.dumps(data))
            self.assertEqual(read_episode(folder)['shots'][0]['voiceTake'], 2)
            for changes in ({'voiceTake': 0}, {'voiceTake': True}, {'voiceTake': 2, 'speaker': 'M2'}):
                shot.update(changes)
                manifest.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, 'voiceTake'):
                    read_episode(folder)

    def test_directed_host_keeps_individual_readers_and_existing_recordings(self):
        self.assertEqual(speaker_for({}, {}), SPEAKER)
        episode = {'narrator': PRESENTER}
        self.assertEqual(speaker_for(episode, {}), PRESENTER)
        self.assertEqual(speaker_for(episode, {'speaker': 'M4'}), 'M4')
        self.assertEqual(speaker_for(episode, {'speaker': 'M4', 'recording': 'assets/reader.wav'}), 'recording')

    def test_a_comment_crop_used_as_a_caption_matches_the_accessible_subtitles(self):
        with TemporaryDirectory() as directory:
            folder = candidate(Path(directory), 'quote', 111)
            (folder / 'assets').mkdir()
            (folder / 'assets/quote.jpg').touch()
            manifest = folder / 'episode.json'
            data = json.loads(manifest.read_text())
            data['narrator'] = PRESENTER
            shot = data['shots'][0]
            shot.update(caption='거짓인 게 증명되면요?', speaker='M4',
                        sourceComment=dict(quote='거짓인게 증명되면요?', anchor='comment_8',
                                           time='16:09', capture='assets/quote.jpg', shownAsCaption=True))
            manifest.write_text(json.dumps(data))
            self.assertTrue(read_episode(folder)['shots'][0]['sourceComment']['shownAsCaption'])
            shot['caption'] = '다른 질문'
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, '같은 댓글'):
                read_episode(folder)

    def test_comment_capture_and_movie_must_travel_with_the_episode(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            folder = candidate(root, 'reaction', 100)
            assets = folder / 'assets'
            assets.mkdir()
            (assets / 'crop.jpg').touch()
            (assets / 'queue.mp4').touch()
            manifest = folder / 'episode.json'
            data = json.loads(manifest.read_text())
            shot = data['shots'][0]
            shot.update(speaker='F3', sourceComment=dict(quote='문구', anchor='comment_7',
                        time='12:00', capture='assets/crop.jpg'),
                        media=dict(file='assets/queue.mp4', box=[0, 0, 640, 960]))
            manifest.write_text(json.dumps(data))
            self.assertEqual(read_episode(folder)['shots'][0]['speaker'], 'F3')
            shot['media']['file'] = 'episode.json'
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'assets'):
                read_episode(folder)

    def test_concurrent_reruns_count_mobile_and_desktop_as_one_post(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            folders = [candidate(root, 'one', 100), candidate(root, 'also-one', 100, True),
                       candidate(root, 'two', 101), candidate(root, 'three', 102)]
            def produce(_index):
                return run_day(root, '2026-11-21', folders, finished)
            with ThreadPoolExecutor(max_workers=2) as pool:
                reports = list(pool.map(produce, range(2)))
            self.assertEqual(sum(len(report['created']) for report in reports), 2)
            self.assertEqual([p['post'] for p in archive(root)], ['100', '101'])
            following = run_day(root, '2026-11-22', folders, finished)
            self.assertEqual((len(following['created']), following['remaining']), (1, 1))
            self.assertEqual([p['post'] for p in archive(root)], ['100', '101', '102'])

    def test_failed_edit_is_retryable_next_to_a_completed_edit(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            folders = [candidate(root, 'repair', 201), candidate(root, 'ready', 202)]
            def interrupted(folder, episode, destination):
                finished(folder, episode, destination)
                if episode['slug'] == 'repair':
                    raise RuntimeError('인코딩 중단')
            report = run_day(root, '2026-11-21', folders, interrupted)
            self.assertEqual(len(report['failures']), 1)
            self.assertEqual([p['post'] for p in archive(root)], ['202'])
            self.assertTrue((folders[0] / 'episode.json').is_file())
            repaired = run_day(root, '2026-11-21', folders, finished)
            self.assertEqual((len(repaired['created']), repaired['remaining']), (1, 0))
            self.assertEqual(len(list((root / '2026-11-21').iterdir())), 2)

    def test_bad_timeline_does_not_consume_a_slot(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            folder = candidate(root, 'short', 301)
            manifest = folder / 'episode.json'
            data = json.loads(manifest.read_text())
            data['shots'][0]['seconds'] = 29
            manifest.write_text(json.dumps(data))
            report = run_day(root, '2026-11-21', [folder], finished)
            self.assertEqual(report['remaining'], 2)
            self.assertIn('30초', report['failures'][0]['error'])
            self.assertEqual(archive(root), [])
