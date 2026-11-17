import json
import unittest

from clash_bot.perception.protocol import serve


def recording_handlers(calls):
    def handler(name):
        def handle(request):
            calls.append((name, request["image"]))
            return {"handled": name}

        return handle

    return {name: handler(name) for name in ("scan", "guard", "absent")}


class PerceptionProtocolTests(unittest.TestCase):
    def test_refuses_unknown_or_incomplete_requests_and_keeps_serving(self):
        calls, replies = [], []
        lines = [
            json.dumps({"image": "a.png"}),
            json.dumps({"op": "guard", "image": "a.png"}),
            json.dumps(
                {
                    "op": "absent",
                    "image": "a.png",
                    "card": "poison",
                    "box": [1, 2, 3, 4],
                    "gap_ms": 500,
                }
            ),
            json.dumps({"op": "train", "image": "a.png"}),
            "not json",
            json.dumps({"op": "absent", "image": "a.png"}),
            json.dumps({"image": "b.png"}),
        ]
        serve(recording_handlers(calls), lines, replies.append)
        self.assertEqual(
            [reply["type"] for reply in replies],
            ["result", "result", "result", "error", "error", "error", "result"],
        )
        self.assertEqual(
            calls, [("scan", "a.png"), ("guard", "a.png"), ("absent", "a.png"), ("scan", "b.png")]
        )


if __name__ == "__main__":
    unittest.main()
