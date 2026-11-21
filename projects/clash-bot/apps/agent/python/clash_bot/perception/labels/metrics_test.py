import unittest

from clash_bot.perception.labels.learning import adoption, fit
from clash_bot.perception.labels.metrics import Metrics, pairs
from clash_bot.perception.labels.schema import Label


class EvaluationTest(unittest.TestCase):
    def test_matching_maximizes_number_then_distance_and_side(self):
        # A greedy first-to-nearest assignment would consume the only neighbor of the second point.
        actual = [
            dict(kind="knight", side="red", x=40, y=150),
            dict(kind="knight", side="red", x=55, y=150),
        ]
        detected = [
            dict(kind="knight", side="red", x=43, y=150),
            dict(kind="unknown", side="red", x=25, y=150),
            dict(kind="knight", side="blue", x=55, y=150),
        ]
        self.assertEqual(pairs(actual, detected), [(0, 1), (1, 0)])
        label = Label(frameSHA256="0" * 64, reviewer="human", objects=actual).model_dump()
        metric = Metrics()
        metric.add(
            label,
            {
                "units": detected,
                "effectCandidates": [],
                "hand": ["unsure"] * 4,
                "nextCard": "unsure",
                "elixir": 0,
            },
        )
        result = metric.report()
        self.assertIsNone(result["objectsFalsePositives"]["rate"])
        self.assertEqual(result["unknownRate"]["rate"], 0.5)
        self.assertIsNone(result["elixir"]["rate"])
        self.assertEqual(result["missRate"]["count"], 0)

    def test_training_rejects_measurement_and_pilot_cannot_publish(self):
        with self.assertRaisesRegex(ValueError, "measurement"):
            fit(None, [{"split": "measurement"}], None)
        metrics = Metrics().report()
        reasons = adoption(metrics, metrics, ["knight"], False)
        self.assertIn("insufficient_blind_human_slots", reasons)
        self.assertIn("coverage_requires_human_confirmation", reasons)
