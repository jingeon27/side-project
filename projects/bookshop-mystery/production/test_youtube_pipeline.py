import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from requests.exceptions import ConnectionError

from shorts_pipeline import FILES, prepare_package, read_episode
from youtube_upload import STATE_FILE, file_hash, upload_package

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

    def test_prepare_generates_upload_metadata_and_channel_copy(self):
        source = self.root / "rendered"
        source.mkdir()
        for name in FILES:
            (source / name).write_bytes(b"rendered content")
        with patch("shorts_pipeline.promo_art") as draw:
            draw.side_effect = lambda episode, path, font: path.write_bytes(b"poster")
            output = prepare_package(
                read_episode("02-printers"), source, self.root / "youtube",
                "https://example.test/play/?tag=one&tag=two&from=old#receipt",
            )
        plan = json.loads((output / "upload.json").read_text(encoding="utf-8"))
        self.assertEqual(plan["video_sha256"], file_hash(output / "short.mp4"))
        self.assertEqual(plan["status"]["privacyStatus"], "private")
        self.assertIn("from=youtube-shorts#receipt", (output / "profile-link.txt").read_text(encoding="utf-8"))
        self.assertIn("tag=one&tag=two&from=community#receipt", (output / "promotion.md").read_text(encoding="utf-8"))
        self.assertTrue((output / "promo-square.jpg").is_file())
        self.assertFalse((output / STATE_FILE).exists())

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
