import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from requests.exceptions import ConnectionError

from shorts_pipeline import FILES, check_case_packages, prepare_package, read_episode
from youtube_upload import STATE_FILE, connect_channel, file_hash, upload_package

LOCATION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=test"
VIDEO = {"id": "TEST_videox", "status": {"privacyStatus": "private"}}


def response(code, headers=None, content=None):
    outgoing = Mock(status_code=code, headers=headers or {})
    outgoing.json.return_value = content or {}
    return outgoing


class YouTubePipelineTest(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.package = self.root / "package"
        self.package.mkdir()
        self.video = self.package / "short.mp4"
        self.video.write_bytes(b"abcdef")
        (self.package / "upload.json").write_text(json.dumps({
            "version": 1,
            "video_sha256": file_hash(self.video),
            "snippet": {"title": "프린터 조사"},
            "status": {"containsSyntheticMedia": True},
        }), encoding="utf-8")
        self.channel = Mock()
        self.channel.post.return_value = response(200, {"Location": LOCATION})

    @patch("google_auth_oauthlib.flow.InstalledAppFlow.from_client_config")
    def test_connect_requests_the_upload_scope_for_an_explicitly_selected_account(self, make_flow):
        client = self.root / "client.json"
        desktop_client = {"client_id": "test-client", "auth_uri": "https://accounts.google.com/o/oauth2/auth"}
        client.write_text(json.dumps({"installed": desktop_client}), encoding="utf-8")
        destination = self.root / "credentials.json"
        run_server = make_flow.return_value.run_local_server
        credentials = run_server.return_value
        credentials.refresh_token = "test-refresh"
        credentials.to_json.return_value = json.dumps({"refresh_token": "test-refresh"})

        connect_channel(client, destination)

        make_flow.assert_called_once_with(
            {"installed": {**desktop_client, "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth"}},
            ["https://www.googleapis.com/auth/youtube.upload"],
            autogenerate_code_verifier=True,
        )
        self.assertEqual(run_server.call_args.kwargs["prompt"], "select_account consent")
        self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)

    def test_prepare_generates_upload_metadata_and_channel_copy(self):
        source = self.root / "rendered"
        source.mkdir()
        for name in FILES:
            (source / name).write_bytes(b"rendered content")
        with patch("shorts_pipeline.promo_art") as draw:
            draw.side_effect = lambda episode, path, font, play_url: path.write_bytes(b"poster")
            output = prepare_package(
                read_episode("02-printers"), source, self.root / "youtube",
                "https://example.test/play/?tag=one&tag=two&from=old#receipt",
            )
        plan = json.loads((output / "upload.json").read_text(encoding="utf-8"))
        self.assertEqual(plan["video_sha256"], file_hash(output / "short.mp4"))
        self.assertEqual(plan["status"]["privacyStatus"], "private")
        self.assertEqual(
            plan["snippet"]["description"].splitlines()[0],
            "https://example.test/play/?tag=one&tag=two#receipt",
        )
        self.assertIn("from=youtube-shorts#receipt", (output / "profile-link.txt").read_text(encoding="utf-8"))
        self.assertIn("tag=one&tag=two&from=community#receipt", (output / "promotion.md").read_text(encoding="utf-8"))
        self.assertTrue((output / "promo-square.jpg").is_file())
        self.assertFalse((output / STATE_FILE).exists())

    def test_prepare_uses_the_case_path_for_every_episode(self):
        source = self.root / "rendered"
        source.mkdir()
        for name in FILES:
            (source / name).write_bytes(b"rendered content")
        for slug, path in (
            ("01-receipt", "/cases/last-receipt/"),
            ("02-printers", "/cases/last-receipt/"),
            ("03-explained", "/cases/last-receipt/"),
            ("04-returned-key", "/cases/returned-key/"),
            ("05-wet-map-opening", "/cases/wet-map/"),
            ("06-wet-map-evidence", "/cases/wet-map/"),
            ("07-wet-map-explained", "/cases/wet-map/"),
        ):
            with self.subTest(slug=slug), patch("shorts_pipeline.promo_art"):
                package = prepare_package(read_episode(slug), source, self.root / "youtube")
                plan = json.loads((package / "upload.json").read_text(encoding="utf-8"))
                expected = "https://dawn.bambyul.com" + path
                self.assertEqual(plan["snippet"]["description"].splitlines()[0], expected)
                self.assertEqual(
                    (package / "profile-link.txt").read_text(encoding="utf-8").strip(),
                    expected + "?from=youtube-shorts",
                )
                self.assertIn(expected + "?from=community", (package / "promotion.md").read_text(encoding="utf-8"))

    def test_case_stack_requires_all_episodes_and_the_current_video_hash(self):
        case = "/cases/wet-map/"
        site = self.root / "site"
        page = site / "cases/wet-map/index.html"
        page.parent.mkdir(parents=True)
        page.write_text("<title>새 사건</title>", encoding="utf-8")
        source = self.root / "rendered"
        source.mkdir()
        for name in FILES:
            (source / name).write_bytes(b"rendered content")
        packages = self.root / "queue"
        episodes = ["05-wet-map-opening", "06-wet-map-evidence", "07-wet-map-explained"]
        with patch("shorts_pipeline.promo_art") as draw:
            draw.side_effect = lambda episode, path, font, play_url: path.write_bytes(b"poster")
            prepare_package(read_episode(episodes[0]), source, packages)
            with self.assertRaisesRegex(ValueError, episodes[1]):
                check_case_packages(case, packages, site)
            for slug in episodes[1:]:
                prepare_package(read_episode(slug), source, packages)
        self.assertEqual(check_case_packages(case, packages, site)["episodes"], episodes)
        bad_caption = packages / episodes[0] / "captions.srt"
        bad_caption.write_text(r"마른 자국\n폭 확인", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "자막에 줄바꿈"):
            check_case_packages(case, packages, site)
        bad_caption.write_bytes(b"rendered content")
        (packages / episodes[1] / "short.mp4").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "영상 해시"):
            check_case_packages(case, packages, site)

    def test_successful_retry_returns_same_receipt_without_a_new_upload(self):
        self.channel.put.return_value = response(201, content=VIDEO)
        first = upload_package(self.package, "private", self.channel)
        self.assertEqual(first["url"], "https://www.youtube.com/shorts/TEST_videox")
        self.assertEqual(first, upload_package(self.package, "private", self.channel))
        self.channel.post.assert_called_once()
        self.channel.put.assert_called_once()
        self.assertEqual(self.channel.post.call_args.kwargs["json"]["status"]["privacyStatus"], "private")
        state = self.package / STATE_FILE
        self.assertEqual(stat.S_IMODE(state.stat().st_mode), 0o600)
        self.assertNotIn("upload_id", state.read_text(encoding="utf-8"))

    @patch("youtube_upload.time.sleep")
    def test_network_interrupt_resumes_the_server_confirmed_byte_range(self, _sleep):
        sent = []

        def put(_location, *, data, headers, **_options):
            sent.append((headers["Content-Range"], data if isinstance(data, bytes) else data.read()))
            if len(sent) == 1:
                raise ConnectionError("connection lost")
            if len(sent) == 2:
                return response(308, {"Range": "bytes=0-2"})
            return response(201, content=VIDEO)

        self.channel.put.side_effect = put
        upload_package(self.package, "private", self.channel)
        self.channel.post.assert_called_once()
        self.assertEqual(sent, [("bytes 0-5/6", b"abcdef"), ("bytes */6", b""), ("bytes 3-5/6", b"def")])

    @patch("youtube_upload.time.sleep")
    def test_expired_or_finished_session_does_not_start_a_duplicate(self, _sleep):
        self.channel.put.side_effect = ConnectionError("all requests timed out")
        with self.assertRaisesRegex(ValueError, "같은 패키지"):
            upload_package(self.package, "private", self.channel)
        self.channel.put.side_effect = None
        self.channel.put.return_value = response(404)
        with self.assertRaisesRegex(ValueError, "세션이 만료"):
            upload_package(self.package, "private", self.channel)
        self.channel.put.return_value = response(200, content=VIDEO)
        self.assertEqual(upload_package(self.package, "private", self.channel)["video_id"], VIDEO["id"])
        self.channel.post.assert_called_once()

    def test_modified_file_is_rejected_before_network_calls(self):
        self.video.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "영상이 준비 이후 변경"):
            upload_package(self.package, "private", self.channel)
        self.channel.post.assert_not_called()
        self.channel.put.assert_not_called()
