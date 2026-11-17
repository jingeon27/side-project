import json
import unittest

from pydantic import ValidationError

from clash_bot.arena.policy.features import ACTION_SIZE
from clash_bot.paths import FIXTURES_DIR
from clash_bot.trophy.protocol import (
    Episode,
    Result,
    Transition,
    checked_training_episodes,
    probabilities,
    return_advantage,
)


def transition():
    return {
        "at": 1000.0,
        "image": "0001.png",
        "imageSHA256": "a" * 64,
        "features": {"index": [1], "value": [0.5]},
        "actionFeatures": [[0.0] * ACTION_SIZE, [0.0] * ACTION_SIZE],
        "bias": [0.0, 0.0],
        "temperature": 1.0,
        "exploration": 0.01,
        "probabilities": [0.5, 0.5],
        "chosen": 0,
        "value": 0.0,
        "confirmation": "verified_wait",
    }


def episode():
    return {
        "format": "trophy-own-trajectory-v1",
        "id": "00000000-0000-4000-8000-000000000001",
        "role": "training",
        "behaviorSHA256": "b" * 64,
        "policy": {"checkpoint": "policy.json", "version": 0, "weightsSHA256": "c" * 64},
        "result": {"blue": 0, "red": 3, "outcome": "loss"},
        "resultEvidence": [
            {"image": "result-1.png", "sha256": "a" * 64, "at": 2000.0},
            {"image": "result-2.png", "sha256": "a" * 64, "at": 2500.0},
        ],
        "transitions": [{**transition(), "at": 1000.0 + i} for i in range(8)],
        "sent": 0,
        "confirmed": 0,
        "learningEligible": True,
    }


class OwnTrophyProtocolTest(unittest.TestCase):
    def test_current_categorical_probabilities_match_shared_ts_cases(self):
        cases = json.loads((FIXTURES_DIR / "trophy-behavior-cases.json").read_text())
        for case in cases:
            actual = probabilities(
                case["logits"], case["bias"], case["temperature"], case["exploration"]
            )
            for a, b in zip(actual, case["expected"]):
                self.assertAlmostEqual(a, b, places=10)

    def test_only_new_verified_training_games_are_accepted(self):
        row = Episode.model_validate(episode())
        self.assertEqual(checked_training_episodes([row], "b" * 64), [row])
        for role in ("baseline", "candidate", "recovery"):
            with self.assertRaises(ValidationError):
                Episode.model_validate({**episode(), "role": role})
        readonly = Episode.model_validate({**episode(), "learningEligible": False})
        with self.assertRaises(ValueError):
            checked_training_episodes([readonly], "b" * 64)
        with self.assertRaises(ValueError):
            checked_training_episodes([row, row], "b" * 64)
        with self.assertRaises(ValueError):
            checked_training_episodes([row], "d" * 64)
        with self.assertRaises(ValidationError):
            Episode.model_validate({**episode(), "format": "native-readonly-trophy-live-v1"})

    def test_rejects_unverified_outcomes_actions_and_non_probabilities(self):
        for overrides in (
            {"chosen": 2},
            {"probabilities": [1.0, 0.0]},
            {"bias": [0.0]},
            {"temperature": 0.0},
        ):
            with self.assertRaises(ValidationError):
                Transition.model_validate({**transition(), **overrides})
        with self.assertRaises(ValidationError):
            Episode.model_validate({**episode(), "sent": 2, "confirmed": 1})
        with self.assertRaises(ValidationError):
            Result.model_validate({"blue": 0, "red": 3, "outcome": "win"})

    def test_losses_remain_a_nonzero_policy_signal_and_crowns_are_observed(self):
        reward = Result(blue=0, red=1, outcome="loss").reward()
        self.assertLess(return_advantage(reward, -1), -0.3)
        self.assertGreater(reward, Result(blue=0, red=3, outcome="loss").reward())
        self.assertGreater(Result(blue=3, red=0, outcome="win").reward(), 0.9)


if __name__ == "__main__":
    unittest.main()
