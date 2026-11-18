"""One generation: frozen self-play games, then one learner update saved as a new candidate."""

import shutil
import uuid

import numpy as np

from ..study.curriculum import from_selfplay
from ..study.export import export
from ..training.coverage import card_coverage
from ..training.deck_practice import schedule_deck
from ..training.evaluation import pfsp_weights
from ..training.parallel import play_frozen_game
from ..training.pressure import schedule_pressure
from ..training.replay import replay_coverage, replay_samples
from ..training.selfplay import SELFPLAY, setup_for
from ..training.storage import read_episode, replay_path, seed_for, write_episode, write_replay
from .champions import checkpoint, store

REPLAY_EPISODES = 256
REPLAY_SAMPLES = 16384


def next_version(root, league):
    # A crash between checkpoint rename and pointer publication can leave an immutable
    # orphan. Retain it and allocate a fresh number.
    saved = [
        int(path.name[1:]) for path in (root / "checkpoints").glob("v*") if path.name[1:].isdigit()
    ]
    return max([league["learner"], *saved]) + 1


def scheduled(root, league, rules, version, indexes, settings, rng):
    """The champion teaches; one quarter meet tactical attackers, the rest qualified policies.

    Past champions the current champion loses to more often are picked more often.
    """
    jobs = []
    every = SELFPLAY.pressureEvery
    for index in indexes:
        scripted = index % every == every - 1
        rates = [(row["wins"] + 1) / (row["games"] + 2) for row in league["opponents"]]
        selected = (
            None
            if index % 2 == 0 or scripted
            else league["opponents"][int(rng.choice(len(rates), p=pfsp_weights(rates)))]
        )
        opponent = league["champion"] if selected is None else selected["version"]
        game_id = f"train-{version}-{index}-{uuid.uuid4().hex[:8]}"
        setup = setup_for(game_id)
        seat = (version + index // (every if scripted else 2)) % 2
        if scripted:
            slot = index // every
            setup = schedule_pressure(
                setup,
                (version - 1) * (settings["games"] // every) + slot,
                seat,
                (version + slot // 2) % 2 == 1,
            )
        elif index % every == 0:
            slots = (settings["games"] + every - 1) // every
            setup = schedule_deck(setup, (version - 1) * slots + index // every, seat)
        jobs.append(
            {
                "current": str(checkpoint(root, league["champion"])),
                "opponent": None if scripted else str(checkpoint(root, opponent)),
                "selected": None if selected is None else opponent,
                "index": index,
                "seat": seat,
                "id": game_id,
                "setup": setup,
                "rulesID": rules["id"],
                "simulations": settings["simulations"],
                "depth": settings["depth"],
            }
        )
    return jobs


def selfplay(control, workers, root, league, rules, version, settings):
    """This generation's games, one batch of workers at a time; returns the verified games.

    Each process has a separate native battle and frozen policy. Only the owner writes
    episodes, counters and the league pointer, after every game.
    """
    games, played = settings["games"], []
    rng = np.random.default_rng(seed_for("opponent_pool", rules["id"], version))
    for begin in range(0, games, workers.count):
        if control.stopped():
            break
        indexes = range(begin, min(games, begin + workers.count))
        jobs = scheduled(root, league, rules, version, indexes, settings, rng)
        control.report(
            {
                "phase": "selfplay",
                "game": begin + 1,
                "candidate": version,
                "activeWorkers": len(jobs),
            }
        )
        for job, game in zip(jobs, workers.map(play_frozen_game, jobs)):
            path = root / "episodes" / f"{job['id']}.json.gz"
            write_episode(path, game)
            write_replay(path, game)
            if not game["completed"] or game["rejectedCommands"]:
                raise ValueError(
                    "Self-play produced an incomplete game or rejected input; not training it"
                )
            league["episodes"].append(str(path))
            played.append(game)
            control.state["completedGames"] += 1
            if job["selected"] is not None:
                selected = next(
                    row for row in league["opponents"] if row["version"] == job["selected"]
                )
                selected["games"] += 1
                selected["wins"] += (
                    0.5 if game["winner"] == 2 else int(game["winner"] == job["seat"])
                )
            store(root, league)
            control.report(
                {
                    "game": job["index"] + 1,
                    "completedGames": control.state["completedGames"],
                    "lastPolicyOnlyDecisions": game["policyOnlyDecisions"],
                    "lastSearchUnavailable": game["searchUnavailable"],
                }
            )
    if played:
        control.report({"trainingCoverage": card_coverage(played)})
    return played


def learn(control, root, league, rules, learner, version):
    """Train the learner on the recent replay window and publish it as the new candidate."""
    control.report({"phase": "training", "candidate": version})
    # A wide window of compact replays reuses many games per update without reading the full
    # episodes, which keep observations only for exports.
    history = [read_episode(replay_path(path)) for path in league["episodes"][-REPLAY_EPISODES:]]
    samples = replay_samples(
        history, rules["id"], max_samples=REPLAY_SAMPLES, seed=seed_for("replay", version)
    )
    training = learner.train(samples, seed=seed_for("optimizer", version))
    training["optimizerCoverage"] = replay_coverage(samples)
    if not training["updated"]:
        raise ValueError("Completed self-play data did not change policy weights")
    temporary = checkpoint(root, version).with_suffix(".pending")
    if temporary.exists():
        shutil.rmtree(temporary)  # Only our unpublished scratch checkpoint.
    learner.save(
        temporary,
        {
            "version": version,
            "rulesID": rules["id"],
            "parent": league["learner"],
            "training": training,
            "role": "unqualified_candidate",
        },
    )
    temporary.rename(checkpoint(root, version))
    league["learner"] = version
    store(root, league)
    control.report({"phase": "trained", "training": training, "learner": version})


def qwen_datasets(control, data_dir, games):
    """Supervision for the separate Qwen candidate, made from this generation's games."""
    dataset = export(data_dir, games)
    if dataset:
        control.report({"qwenSearchDataset": dataset})
    tactical = from_selfplay(data_dir, games)
    if tactical:
        control.report({"qwenTacticalDatasets": tactical})
