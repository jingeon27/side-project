import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import mlx.core as mx
import mlx.nn as nn

from clash_bot.qwen.episode_events import confirmed_input, verified_result
from clash_bot.qwen.features import output_token_rows
from clash_bot.qwen.learning_policy import FORMAT, FinalMLPLoRA, weights_digest
from clash_bot.qwen.model_specs import MODEL
from clash_bot.qwen.runtime import LearningWorker


class LearningEpisodeTest(unittest.TestCase):
    def test_explicit_input_confirmation_does_not_trust_a_dark_bar_animation(self):
        self.assertFalse(
            confirmed_input(
                {"type": "input_check", "changed": True, "spent": 8, "confirmed": False}
            )
        )
        self.assertTrue(
            confirmed_input({"type": "input_check", "changed": True, "spent": 0, "confirmed": True})
        )
        self.assertFalse(confirmed_input({"type": "input_check", "changed": True, "spent": 3}))
        self.assertFalse(
            confirmed_input(
                {"type": "input_check", "changed": False, "spent": 3, "confirmed": True}
            )
        )

    def test_counterpush_rewards_require_two_identical_visible_crown_labels(self):
        result = {
            "type": "result",
            "source": "counterpush_result_dom_verified2",
            "blue": 0,
            "red": 3,
            "readings": ["Crowns: you 0, the opponent 3"] * 2,
        }
        self.assertTrue(verified_result(result))
        self.assertFalse(verified_result({**result, "readings": result["readings"][:1]}))
        self.assertFalse(verified_result({**result, "blue": 3, "red": 0}))
        self.assertTrue(
            verified_result({**result, "readings": ["Crowns: you 0, the opponent 3, overtime"] * 2})
        )
        self.assertFalse(
            verified_result(
                {**result, "readings": ["Crowns: you 0, the opponent 3, still playing"] * 2}
            )
        )

    def test_ability_learning_requires_explicit_cost_button_and_hand_confirmation(self):
        event = {
            "type": "ability_check",
            "confirmed": True,
            "changed": True,
            "handUnchanged": True,
            "expectedCost": 2,
            "action": {"kind": "ability", "card": "ice_wizard"},
        }
        self.assertTrue(confirmed_input(event))
        for key, value in [
            ("confirmed", False),
            ("changed", False),
            ("handUnchanged", False),
            ("expectedCost", 3),
        ]:
            self.assertFalse(confirmed_input({**event, key: value}))
        self.assertFalse(confirmed_input({"type": "ability_check", "changed": True, "spent": 2}))

    def test_confirmed_hero_activation_participates_in_the_actual_episode_training(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker)
            path = Path(directory) / "events.jsonl"
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            rows = [
                (
                    {
                        "type": "ability_check",
                        "frame": 1,
                        "confirmed": True,
                        "changed": True,
                        "handUnchanged": True,
                        "expectedCost": 2,
                        "action": {"kind": "ability", "card": "ice_wizard"},
                    }
                    if row.get("type") == "input_check" and row.get("frame") == 1
                    else row
                )
                for row in rows
            ]
            path.write_text("\n".join(json.dumps(row) for row in rows))
            worker.train({"episode": directory})
            self.assertEqual(len(worker.learner.train.call_args.args[0]), 2)

    def worker(self):
        worker = object.__new__(LearningWorker)
        worker.spec = MODEL
        worker.directory = Path("/nonexistent/clash-test/qwen/learning")
        worker.learner = SimpleNamespace(
            adapter=FinalMLPLoRA(1, 1), train=Mock(return_value={"updated": False})
        )
        return worker

    def write_episode(self, directory, worker, readings=("Crowns: you 0, the opponent 1",) * 2):
        directory = Path(directory).resolve()
        features = directory / "features"
        features.mkdir()
        prediction = lambda frame: {
            "type": "prediction",
            "image": str(directory / f"{frame:04d}.png"),
            "behavior": {
                "format": FORMAT,
                "model_identity": MODEL["identity"],
                "trainable": True,
                "labels": [0, 1],
                "chosen": 0,
                "old_log_probs": [-0.6, -0.7],
                "version": 0,
                "adapter_sha256": weights_digest(worker.learner.adapter),
                "feature_path": str(features / f"{frame:04d}.npz"),
            },
        }
        for frame in (1, 3):
            mx.savez(
                str(features / f"{frame:04d}.npz"),
                features=mx.zeros(MODEL["input_size"]),
                base=mx.zeros(MODEL["hidden_size"]),
            )
        rows = [
            prediction(1),
            prediction(2),
            prediction(3),
            {"type": "input_check", "frame": 1, "changed": True, "spent": 3, "confirmed": True},
            {"type": "input_check", "frame": 2, "changed": False, "spent": 3, "confirmed": False},
            {"type": "wait_check", "frame": 3, "valid": True},
            {
                "type": "result",
                "source": "counterpush_result_dom_verified2",
                "blue": 0,
                "red": 1,
                "outcome": "win",
                "readings": list(readings),
            },
        ]
        (directory / "events.jsonl").write_text("\n".join(json.dumps(row) for row in rows))

    def test_uses_verified_crowns_and_only_confirmed_actions_or_waits(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker)
            worker.train({"episode": directory})
            samples, reward, episode = worker.learner.train.call_args.args
            self.assertEqual(reward, -1)  # Disregards the incorrect model outcome.
            self.assertEqual(len(samples), 2)
            self.assertEqual(episode, str(Path(directory).resolve()))

    def test_does_not_train_on_a_single_unverified_result_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker, readings=("Crowns: you 0, the opponent 1",))
            self.assertEqual(worker.train({"episode": directory})["reason"], "no_verified_result")
            worker.learner.train.assert_not_called()

    def test_rejects_features_from_a_different_model(self):
        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            self.write_episode(directory, worker)
            worker.spec = {**MODEL, "identity": "0" * 64}
            with self.assertRaisesRegex(ValueError, "different base model"):
                worker.train({"episode": directory})
            worker.learner.train.assert_not_called()

    def test_parallel_training_reads_both_episodes_before_one_learner_update(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            worker = self.worker()
            worker.learner.train_batch = Mock(return_value={"updated": True, "version": 1})
            self.write_episode(first, worker)
            self.write_episode(second, worker)
            report = worker.train_batch({"episodes": [first, second]})
            self.assertTrue(report["updated"])
            games = worker.learner.train_batch.call_args.args[0]
            self.assertEqual([len(game["samples"]) for game in games], [2, 2])
            self.assertEqual([game["reward"] for game in games], [-1, -1])
            worker.learner.train.assert_not_called()
            with self.assertRaises(ValueError):
                worker.train_batch({"episodes": [first, first]})

    def test_reads_action_rows_from_the_separate_lm_head(self):
        embedding = nn.Embedding(8, 4)
        embedding.weight = mx.full((8, 4), 2.0)
        head = nn.Linear(4, 8, bias=False)
        head.weight = mx.full((8, 4), 7.0)
        language = SimpleNamespace(model=SimpleNamespace(embed_tokens=embedding), lm_head=head)
        self.assertEqual(output_token_rows(language, mx.array([1, 3])).tolist(), [[7.0] * 4] * 2)

    def test_quantized_output_rows_preserve_native_projection_precision(self):
        mx.random.seed(321)
        base = nn.Linear(256, 32, bias=False)
        base.weight = base.weight.astype(mx.bfloat16)
        head = nn.QuantizedLinear.from_linear(base, group_size=64, bits=4)
        language = SimpleNamespace(lm_head=head)
        labels = mx.array([1, 3, 7])
        features = mx.random.normal((256,)).astype(mx.float32)
        rows = output_token_rows(language, labels)
        self.assertTrue(
            mx.allclose(rows @ features, head(features)[labels], atol=1e-5, rtol=1e-5).item()
        )

    def test_imitation_uses_only_before_frame_and_maps_macro_labels_without_reward(self):
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as directory:
            worker = self.worker()
            worker.learner.metadata = {"version": 3, "demonstrations": [], "controller_version": 3}
            worker.learner.imitate = Mock(return_value={"updated": True, "version": 4})
            observation = {
                "id": "red-support",
                "river_y": 276,
                "image": "images/before.png",
                "evidence_image": "images/after.png",
                "before_at": 1000,
                "situation": {
                    "at": 1000,
                    "own": {"units": [], "recentPlays": []},
                    "opponent": {"units": [], "elixir": {"min": 0, "max": 10}},
                },
                "candidates": [
                    {"id": 7, "card": None, "cost": 0, "target": {"x": 0, "y": 0}},
                    {"id": 2, "card": "furnace", "cost": 4, "target": {"x": 95, "y": 350}},
                    {"id": 9, "card": "furnace", "cost": 4, "target": {"x": 90, "y": 360}},
                ],
                "choices": [7, 2, 9],
                "target_ids": [2, 9],
                "confidence": 0.95,
            }

            def choose(request):
                feature_path = Path(request["feature_path"])
                feature_path.parent.mkdir(parents=True)
                mx.savez(str(feature_path), features=mx.ones(12), base=mx.ones(8))
                return {
                    "behavior": {
                        "labels": [0, 1, 2],
                        "version": 3,
                        "old_log_probs": [-1.1, -1.1, -1.1],
                    }
                }

            worker.choose = Mock(side_effect=choose)
            path = Path(directory) / "dataset.json"
            with patch(
                "clash_bot.qwen.runtime.load_demonstrations",
                return_value=({"samples": [observation]}, "digest", path),
            ):
                report = worker.imitate({"dataset": str(path)})
            self.assertTrue(report["updated"])
            self.assertEqual(
                worker.choose.call_args.args[0]["images"], [str(path.parent / "images/before.png")]
            )
            samples, identity = worker.learner.imitate.call_args.args
            self.assertEqual(samples[0]["targets"], [1, 2])
            self.assertEqual(identity, "digest")
            worker.learner.train.assert_not_called()


if __name__ == "__main__":
    unittest.main()
