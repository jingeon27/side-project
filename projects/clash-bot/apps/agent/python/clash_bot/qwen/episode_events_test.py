"""The TypeScript writer (src/counterpush/match/episode-events.spec.ts) produces the same rows."""

import json
import unittest

from clash_bot.paths import FIXTURES_DIR
from clash_bot.qwen.episode_events import confirmed_input, confirmed_wait, verified_result

CASES = json.loads((FIXTURES_DIR / "counterpush/episode-events.json").read_text())["cases"]


class EpisodeEvidenceContractTests(unittest.TestCase):
    def test_accepts_exactly_the_evidence_the_typescript_episode_writes(self):
        for case in CASES:
            with self.subTest(case["name"]):
                self.assertEqual(verified_result(case["row"]), case["verifiedResult"])
                self.assertEqual(confirmed_input(case["row"]), case["confirmedInput"])
                self.assertEqual(confirmed_wait(case["row"]), case["confirmedWait"])


if __name__ == "__main__":
    unittest.main()
