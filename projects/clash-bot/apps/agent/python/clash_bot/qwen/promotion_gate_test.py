"""The promotion gate without MLX, so CI checks it on every change.

The TypeScript evaluation gate (src/shared/qualification.spec.ts) reads the same cases and must agree.
"""

import json
import unittest

from clash_bot.paths import FIXTURES_DIR
from clash_bot.qwen.promotion import qualification_scores
from clash_bot.qwen.qualification import RESULT_LABEL, attempt_alpha

CASES = json.loads((FIXTURES_DIR / "qualification-cases.json").read_text())


class PromotionGateTests(unittest.TestCase):
    def test_decides_each_shared_case_as_the_typescript_gate_does(self):
        for gate in CASES["gates"]:
            with self.subTest(gate["name"]):
                scores = (
                    [1.0] * gate["wins"]
                    + [0.5] * gate["ties"]
                    + [0.0] * gate["losses"]
                    + [0.7] * gate["invalid"]
                )
                alpha = attempt_alpha(gate["attempt"])
                if gate["qualifies"]:
                    self.assertLessEqual(qualification_scores(scores, alpha)["oneSidedP"], alpha)
                    continue
                with self.assertRaises(ValueError):
                    qualification_scores(scores, alpha)

    def test_reads_result_labels_as_the_typescript_browser_does(self):
        for row in CASES["resultLabels"]:
            with self.subTest(row["label"]):
                match = RESULT_LABEL.fullmatch(row["label"])
                parsed = (int(match[1]), int(match[2])) if match else (None, None)
                self.assertEqual(parsed, (row["blue"], row["red"]))


if __name__ == "__main__":
    unittest.main()
