import json
import unittest

import numpy as np

from clash_bot.arena.policy.tactics import action_biases
from clash_bot.arena.policy.tactics_spec import SPEC
from clash_bot.paths import FIXTURES_DIR

CASES = json.loads((FIXTURES_DIR / "fast-tactics-cases.json").read_text())


class TacticalOffsetsTest(unittest.TestCase):
    def test_shared_live_native_cases_keep_all_legal_choices_and_public_unknowns(self):
        for case in CASES:
            with self.subTest(case=case["name"]):
                context = case["context"]
                before = json.dumps(context, sort_keys=True)
                scores = action_biases(context)
                maximum = max(
                    SPEC["timelyBuildingWaitCost"],
                    SPEC["priorLimit"]
                    + max(SPEC["placementAdvice"].values())
                    + SPEC["unsupportedGraveyardSpendCost"]
                    + SPEC["unsupportedOpeningGraveyardCost"],
                )
                self.assertTrue(np.all(np.abs(scores) <= maximum))
                if "bias" in case:
                    np.testing.assert_allclose(scores, case["bias"], atol=1e-5)
                for better, worse in case.get("preferred", []):
                    self.assertGreater(scores[better], scores[worse])
                self.assertEqual(json.dumps(context, sort_keys=True), before)
