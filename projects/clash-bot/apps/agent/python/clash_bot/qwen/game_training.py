"""Turn verified own episodes and observed opponent demonstrations into learner updates."""

from pathlib import Path

import mlx.core as mx

from clash_bot.files import atomic_json
from clash_bot.qwen.decision_input import mirror_actor_prompt
from clash_bot.qwen.opponent_data import load_demonstrations
from clash_bot.qwen.training_budget import training_work

from .episodes import episode_samples


class GameTraining:
    def train(self, request):
        path = str(Path(request["episode"]).resolve())
        if path in getattr(self.learner, "metadata", {}).get("episodes", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        episode = episode_samples(request["episode"], self.learner, self.spec)
        if episode is None:
            return {"updated": False, "reason": "no_verified_result"}
        report = self.learner.train(episode["samples"], episode["reward"], episode["episode"])
        directory = Path(episode["episode"])
        atomic_json(directory / "training.json", report)
        return report

    def train_batch(self, request):
        paths = request.get("episodes", [])
        if not 1 <= len(paths) <= 2 or len({str(Path(path).resolve()) for path in paths}) != len(
            paths
        ):
            raise ValueError("Expected one or two distinct episode directories")
        if all(
            str(Path(path).resolve()) in getattr(self.learner, "metadata", {}).get("episodes", [])
            for path in paths
        ):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        # Resolve every behavior checksum before the first weight update.
        episodes = [episode_samples(path, self.learner, self.spec) for path in paths]
        if any(episode is None for episode in episodes):
            return {"updated": False, "reason": "no_verified_result"}
        report = self.learner.train_batch(episodes)
        for episode in episodes:
            atomic_json(Path(episode["episode"]) / "training.json", report)
        return report

    def imitate(self, request):
        if self.learner.metadata.get("controller_version") != 3:
            raise ValueError("Opponent imitation requires the private fast controller")
        dataset, identity, path = load_demonstrations(
            request["dataset"], self.directory.parents[1] / "counterpush/quarantine.json"
        )
        if identity in self.learner.metadata.get("demonstrations", []):
            return {
                "updated": False,
                "reason": "already_trained",
                "version": self.learner.metadata["version"],
            }
        samples = []
        for observation in dataset["samples"]:
            with training_work():
                # The fast controller reads only the BEFORE situation text. The after
                # frame validated the tracked label and is never an inference input.
                feature_path = path.parent / "features" / f"{observation['id']}.npz"
                prediction = self.choose(
                    {
                        "images": [str(path.parent / observation["image"])],
                        "prompt": mirror_actor_prompt(observation),
                        "choices": observation["choices"],
                        "feature_path": str(feature_path),
                        "controller_version": 3,
                    }
                )
                behavior = prediction["behavior"]
                samples.append(
                    {
                        **mx.load(str(feature_path)),
                        "id": observation["id"],
                        "labels": behavior["labels"],
                        "version": behavior["version"],
                        "old_log_probs": mx.array(behavior["old_log_probs"]),
                        "targets": [
                            observation["choices"].index(target)
                            for target in observation["target_ids"]
                        ],
                        "confidence": observation["confidence"],
                    }
                )
        report = self.learner.imitate(samples, identity)
        report.update(
            {
                "model": self.spec["name"],
                "model_identity": self.spec["identity"],
                "source": "counterpush_live_screen",
                "observed_label": "mirror_actor_card_lane_or_placement_region",
            }
        )
        atomic_json(path.parent / "training.json", report)
        return report
