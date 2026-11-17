import json
import unittest

import numpy as np

from clash_bot.arena.policy.tactics import action_biases
from clash_bot.paths import FIXTURES_DIR


class TacticalOffsetsTest(unittest.TestCase):
    def test_shared_live_native_cases_keep_all_legal_choices_and_public_unknowns(self):
        for case in json.loads((FIXTURES_DIR / "fast-tactics-cases.json").read_text()):
            with self.subTest(case=case["name"]):
                context = case["context"]
                before = json.dumps(context, sort_keys=True)
                np.testing.assert_allclose(action_biases(context), case["bias"], atol=1e-5)
                self.assertEqual(json.dumps(context, sort_keys=True), before)
