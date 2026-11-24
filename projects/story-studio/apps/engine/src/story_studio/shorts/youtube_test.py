import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import stat
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from . import youtube
from . import youtube_api as api
from .edition import run_day
from .edition_test import candidate, finished
from ..storage import atomic_json


DAY = '2026-11-22'
CHANNEL = {'id': 'UC' + 'x' * 22, 'title': '실베다큐 시험'}
SESSION = api.VIDEO_UPLOAD + '?upload_id=test'
VIDEO = 'abcdefg1234'


def response(code, *, headers=None, body=None):
    return api.Response(code, headers or {}, body or {})


class YouTubeUploadTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.home = Path(directory.name)
        self.state = self.home / '.youtube'
        self.state.mkdir(mode=0o700)
        self.auth = self.state / 'authorization.json'
        self.receipt = self.state / 'upload-480321.json'
        parser = argparse.ArgumentParser()
        youtube.options(parser, DAY)
        self.parse = parser.parse_args
        mock = patch.object(youtube, 'seoul_date', return_value=DAY)
        mock.start()
        self.addCleanup(mock.stop)

    def connect_fake(self, target=CHANNEL, *, starts=DAY):
        atomic_json(self.auth, dict(channelId=target['id'], auto=dict(startOn=starts, privacy='private', madeForKids=False)))

    def ready(self, day=DAY):
        source = candidate(self.home, 'sample', 480321)
        return run_day(self.home, day, [source], finished)['created'][0]

    def success(self):
        return response(201, body={'id': VIDEO, 'snippet': {'channelId': CHANNEL['id']},
                                   'status': {'privacyStatus': 'private'}})

    def auto(self, *flags):
        return youtube.run(self.home, self.parse(['upload', '--auto', *flags]))

    def test_unconnected_or_archive_before_consent_does_not_contact_google(self):
        self.ready('2026-11-21')
        with patch.object(api, 'refresh') as refresh:
            self.assertEqual(self.auto()['skipped'], 'auto_off')
            self.connect_fake()
            self.assertEqual(self.auto('--date', '2026-11-21')['skipped'], 'outside_auto_dates')
            refresh.assert_not_called()

    def test_connection_binds_channel_and_auto_consent_without_printing_secrets(self):
        config = self.home / 'client.json'
        client = {'client_id': 'example.apps.googleusercontent.com', 'client_secret': 'local-client-secret'}
        config.write_text(json.dumps({'installed': client}), encoding='utf8')
        with (patch.object(api, 'authorize', return_value=('access', 'private-refresh')) as authorize,
              patch.object(api, 'channel', return_value=CHANNEL),
              patch.object(youtube, 'confirm') as consent):
            out = youtube.run(self.home, self.parse(['connect', str(config), '--auto', 'private']))
        authorize.assert_called_once_with(client)
        self.assertIn(CHANNEL['id'], consent.call_args.args[0])
        self.assertIn('private', consent.call_args.args[0])
        self.assertEqual(out['auto'], {'startOn': DAY, 'privacy': 'private', 'madeForKids': False})
        self.assertNotIn('private-refresh', json.dumps(out))
        self.assertEqual(stat.S_IMODE(self.auth.stat().st_mode), 0o600)

    def test_changed_google_channel_blocks_upload_before_any_media_request(self):
        self.ready()
        self.connect_fake()
        with (patch.object(api, 'refresh', return_value='access'),
              patch.object(api, 'channel', return_value={'id': 'UC' + 'b' * 22, 'title': '다른 채널'}),
              patch.object(api, 'start_session') as start):
            with self.assertRaisesRegex(RuntimeError, '채널과 다릅니다'):
                self.auto()
            start.assert_not_called()

    def test_interrupted_final_response_is_recovered_without_second_insert(self):
        self.ready()
        self.connect_fake()
        with (patch.object(api, 'refresh', return_value='access'),
              patch.object(api, 'channel', return_value=CHANNEL),
              patch.object(youtube, 'verify_movie'),
              patch.object(api, 'start_session', return_value=SESSION) as start,
              patch.object(api, 'send_range', side_effect=[RuntimeError('전송 연결 중단'), self.success()]) as send):
            self.assertIn('연결 중단', self.auto()['failures'][0]['error'])
            job = json.loads(self.receipt.read_text())
            self.assertEqual(job['phase'], 'finishing')
            self.assertEqual(self.auto()['videos'][0]['videoId'], VIDEO)
            self.assertEqual(self.auto()['videos'][0]['state'], 'already_uploaded')
        self.assertEqual(start.call_count, 1)
        self.assertEqual(start.call_args.args[1]['status']['privacyStatus'], 'private')
        self.assertEqual(start.call_args.args[1]['snippet']['title'], '다큐')
        self.assertIn('시험 자료 https://example.org/source', start.call_args.args[1]['snippet']['description'])
        self.assertEqual(send.call_args.args, ('access', SESSION, 4))
        self.assertEqual(json.loads(self.receipt.read_text())['phase'], 'uploaded')
        self.assertNotIn(SESSION, self.receipt.read_text())

    def test_expired_last_request_stays_uncertain_and_is_not_reposted(self):
        self.ready()
        self.connect_fake()
        with (patch.object(api, 'refresh', return_value='access'),
              patch.object(api, 'channel', return_value=CHANNEL),
              patch.object(youtube, 'verify_movie'),
              patch.object(api, 'start_session', return_value=SESSION) as start,
              patch.object(api, 'send_range', side_effect=[RuntimeError('전송 연결 중단'), response(404)])):
            self.assertEqual(len(self.auto()['failures']), 1)
            self.assertIn('Studio', self.auto()['failures'][0]['error'])
            self.assertIn('--restart', self.auto()['failures'][0]['error'])
        start.assert_called_once()
        self.assertEqual(json.loads(self.receipt.read_text()), {'phase': 'uncertain'})

    def test_concurrent_runs_send_the_final_file_once(self):
        self.ready()
        self.connect_fake()
        with (patch.object(api, 'refresh', return_value='access'),
              patch.object(api, 'channel', return_value=CHANNEL),
              patch.object(youtube, 'verify_movie'),
              patch.object(api, 'start_session', return_value=SESSION) as start,
              patch.object(api, 'send_range', return_value=self.success()) as send):
            with ThreadPoolExecutor(max_workers=2) as pool:
                states = [out['videos'][0]['state'] for out in pool.map(lambda _: self.auto(), range(2))]
        self.assertCountEqual(states, ['uploaded', 'already_uploaded'])
        start.assert_called_once()
        send.assert_called_once()

    def test_disconnect_erases_google_data_and_keeps_duplicate_marker(self):
        self.ready()
        self.connect_fake()
        atomic_json(self.receipt, {'phase': 'uploaded', 'videoId': VIDEO, 'recordedOn': DAY})
        with patch.object(api, 'revoke') as revoke:
            out = youtube.run(self.home, self.parse(['disconnect']))
        revoke.assert_called_once()
        self.assertTrue(out['revoked'])
        self.assertFalse(self.auth.exists())
        self.assertEqual(json.loads(self.receipt.read_text()), {'phase': 'uploaded'})
        self.connect_fake()
        with patch.object(api, 'start_session') as start:
            self.assertEqual(self.auto()['videos'][0]['state'], 'already_uploaded')
            start.assert_not_called()


class YouTubeProtocolTest(unittest.TestCase):
    def test_desktop_uses_loopback_pkce_and_offline_scopes(self):
        callback = ('authorization-code', 'http://127.0.0.1:12345/')
        with (
            patch.object(api, 'authorization_code', return_value=callback) as code,
            patch.object(api, 'form', return_value=response(200, body={
                'scope': ' '.join(sorted(api.SCOPES)), 'refresh_token': 'refresh', 'access_token': 'access',
            })) as exchange,
        ):
            self.assertEqual(api.authorize({'client_id': 'client'}), ('access', 'refresh'))
        verifier = exchange.call_args.kwargs['code_verifier'].encode('ascii')
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier).digest()).decode('ascii').rstrip('=')
        self.assertEqual(code.call_args.args[1], challenge)
        self.assertEqual(exchange.call_args.kwargs['redirect_uri'], callback[1])

    def test_resumable_protocol_uses_308_and_validates_the_session_address(self):
        with patch.object(api, 'request', side_effect=[
            response(200, headers={'Location': SESSION}),
            response(308, headers={'Range': 'bytes=0-3'}),
        ]) as request:
            session = api.start_session('access', {'snippet': {}}, 8)
            reply = api.send_range('access', session, 8, 0, b'abcd')
            self.assertEqual(api.received_bytes(reply, 8), 4)
        start, transfer = request.call_args_list
        address = urlsplit(start.args[0])
        self.assertEqual(parse_qs(address.query), {'uploadType': ['resumable'], 'part': ['snippet,status']})
        self.assertEqual(transfer.kwargs['headers']['Content-Range'], 'bytes 0-3/8')
        alternate = 'https://youtube.googleapis.com/resumable/upload/youtube/v3/videos?upload_id=test'
        self.assertEqual(api.session_url(alternate), alternate)
        for link in ['https://example.com/upload/youtube/v3/videos?upload_id=test',
                     'https://www.googleapis.com/youtube/v3/videos?upload_id=test', api.VIDEO_UPLOAD,
                     'https://www.googleapis.com@elsewhere.test/upload/youtube/v3/videos?upload_id=test']:
            with self.subTest(link=link), self.assertRaisesRegex(RuntimeError, '세션'):
                api.session_url(link)
