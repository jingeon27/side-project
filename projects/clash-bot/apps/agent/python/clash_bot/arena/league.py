"""Persistent expert iteration, frozen opponents and qualification, on one Mac.

The learner advances after verified terminal games. The champion pointer moves
only after disjoint, seat-swapped evaluation passes. Neither is a Qwen pointer.
"""

import fcntl
import json
import os
import shutil
import signal
import time
import uuid
from pathlib import Path

import numpy as np

from clash_bot.files import atomic_json

from .champions import checkpoint, initialize, publish_champion
from .policy.network import LEAGUE_KEY, Policy
from .sim.rules import rules_identity
from .sim.verification import verify
from .study.curriculum import from_selfplay
from .study.export import export
from .training.benchmark import benchmark
from .training.evaluation import evaluate, pfsp_weights
from .training.parallel import play_frozen_games
from .training.selfplay import replay_samples, setup_for
from .training.storage import read_episode, replay_path, seed_for, write_episode, write_replay

REPLAY_EPISODES = 256
REPLAY_SAMPLES = 16384


def run(
    data_dir,
    hours=8,
    generations=0,
    games=4,
    simulations=16,
    depth=6,
    pairs=16,
    evaluate_every=1,
    workers=1,
):
    data_dir = Path(data_dir)
    control = data_dir / "arena/control"
    control.mkdir(parents=True, exist_ok=True)
    lock = (control / "lock.json").open("a+")
    try:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError("A local self-play process is already running")
    owner = {"id": str(uuid.uuid4()), "pid": os.getpid(), "startedAt": time.time()}
    lock.seek(0)
    lock.truncate()
    json.dump(owner, lock)
    lock.flush()
    state = {**owner, "phase": "initializing", "completedGenerations": 0, "completedGames": 0}
    interrupted = []
    signal_handlers = {
        sig: signal.signal(sig, lambda *_: interrupted.append(True))
        for sig in (signal.SIGINT, signal.SIGTERM)
    }
    deadline = time.monotonic() + hours * 3600 if hours else float("inf")

    def report(values):
        state.update(values)
        state["updatedAt"] = time.time()
        atomic_json(control / "status.json", state)

    def stopped():
        stop = control / "stop.json"
        return (
            bool(interrupted)
            or time.monotonic() >= deadline
            or (stop.exists() and json.loads(stop.read_text()).get("id") == owner["id"])
        )

    try:
        rules = rules_identity()
        verification = verify(data_dir)
        if not verification["passed"]:
            raise ValueError(
                "Native simulator verification failed; inspect arena/verification before training"
            )
        root = data_dir / "arena/leagues" / f"{rules['id'][:16]}-{LEAGUE_KEY}"
        active = control / "active.json"
        previous = Path(json.loads(active.read_text())["root"]) if active.exists() else None
        league = initialize(root, rules, parent=None if previous == root else previous)
        atomic_json(active, {"root": str(root), "rulesID": rules["id"]})
        start = json.loads((checkpoint(root, 0) / "metadata.json").read_text())
        report(
            {
                "root": str(root),
                "rulesID": rules["id"],
                "inheritedFrom": start.get("inheritedFrom"),
                "champion": league["champion"],
                "learner": league["learner"],
                "settings": {
                    "games": games,
                    "simulations": simulations,
                    "depth": depth,
                    "pairs": pairs,
                    "evaluateEvery": evaluate_every,
                    "workers": workers,
                },
            }
        )
        while not stopped() and (not generations or state["completedGenerations"] < generations):
            if shutil.disk_usage(data_dir).free < 8 * 1024**3:
                raise RuntimeError("Less than 8 GB disk space; stopping before another game")
            current = Policy.load(checkpoint(root, league["learner"]), rules["id"])
            # A crash between checkpoint rename and pointer publication can
            # leave an immutable orphan. Retain it and allocate a fresh number.
            saved = [
                int(path.name[1:])
                for path in (root / "checkpoints").glob("v*")
                if path.name[1:].isdigit()
            ]
            version = max([league["learner"], *saved]) + 1
            pending = []
            rng = np.random.default_rng(seed_for("opponent_pool", rules["id"], version))
            for begin in range(0, games, workers):
                if stopped():
                    break
                jobs = []
                for index in range(begin, min(games, begin + workers)):
                    rates = [(row["wins"] + 1) / (row["games"] + 2) for row in league["opponents"]]
                    selected = (
                        None
                        if index % 2 == 0
                        else league["opponents"][int(rng.choice(len(rates), p=pfsp_weights(rates)))]
                    )
                    opponent = league["learner"] if selected is None else selected["version"]
                    game_id = f"train-{version}-{index}-{uuid.uuid4().hex[:8]}"
                    jobs.append(
                        {
                            "current": str(checkpoint(root, league["learner"])),
                            "opponent": str(checkpoint(root, opponent)),
                            "selected": None if selected is None else opponent,
                            "index": index,
                            "seat": (version + index // 2) % 2,
                            "id": game_id,
                            "setup": setup_for(game_id),
                            "rulesID": rules["id"],
                            "simulations": simulations,
                            "depth": depth,
                        }
                    )
                report(
                    {
                        "phase": "selfplay",
                        "game": begin + 1,
                        "candidate": version,
                        "activeWorkers": len(jobs),
                    }
                )
                # Each process has a separate native battle and frozen policy.
                # Only this owner writes episodes, counters and checkpoints.
                for job, game in zip(jobs, play_frozen_games(jobs, workers)):
                    path = root / "episodes" / f"{job['id']}.json.gz"
                    write_episode(path, game)
                    write_replay(path, game)
                    if not game["completed"] or game["rejectedCommands"]:
                        raise ValueError(
                            "Self-play produced an incomplete game or rejected input; not training it"
                        )
                    league["episodes"].append(str(path))
                    pending.append(game)
                    state["completedGames"] += 1
                    if job["selected"] is not None:
                        selected = next(
                            row for row in league["opponents"] if row["version"] == job["selected"]
                        )
                        selected["games"] += 1
                        selected["wins"] += (
                            0.5 if game["winner"] == 2 else int(game["winner"] == job["seat"])
                        )
                    atomic_json(root / "league.json", league)
                    report({"game": job["index"] + 1, "completedGames": state["completedGames"]})
            if not pending:
                break
            report({"phase": "training", "candidate": version})
            # A wide window of compact replays reuses many games per update without reading
            # the full episodes, which keep observations only for exports.
            history = [
                read_episode(replay_path(path)) for path in league["episodes"][-REPLAY_EPISODES:]
            ]
            samples = replay_samples(
                history, rules["id"], max_samples=REPLAY_SAMPLES, seed=seed_for("replay", version)
            )
            training = current.train(samples, seed=seed_for("optimizer", version))
            if not training["updated"]:
                raise ValueError("Completed self-play data did not change policy weights")
            temporary = checkpoint(root, version).with_suffix(".pending")
            if temporary.exists():
                shutil.rmtree(temporary)  # Only our unpublished scratch checkpoint.
            current.save(
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
            league["opponents"] = (
                league["opponents"] + [{"version": version, "wins": 0, "games": 0}]
            )[-8:]
            if not any(row["version"] == league["champion"] for row in league["opponents"]):
                league["opponents"].insert(
                    0, {"version": league["champion"], "wins": 0, "games": 0}
                )
            atomic_json(root / "league.json", league)
            report({"phase": "trained", "training": training, "learner": version})
            dataset = export(data_dir, pending)
            if dataset:
                report({"qwenSearchDataset": dataset})
            tactical = from_selfplay(data_dir, pending)
            if tactical:
                report({"qwenTacticalDatasets": tactical})
            if version % evaluate_every == 0 and not stopped():
                baseline = Policy.load(checkpoint(root, league["champion"]), rules["id"])
                number = league["evaluations"]
                league["evaluations"] += 1
                atomic_json(root / "league.json", league)  # Spend before play, including crashes.
                result = evaluate(
                    current,
                    baseline,
                    rules["id"],
                    number,
                    pairs=pairs,
                    report=report,
                    should_stop=stopped,
                )
                atomic_json(root / "evaluations" / f"v{version:06d}-e{number:06d}.json", result)
                if result["gate"]["passed"]:
                    league["champion"] = version
                    atomic_json(root / "league.json", league)
                    publish_champion(root, league)
                    # The new champion against the fixed rule bots: an absolute progress curve.
                    measured = benchmark(current, rules["id"], report=report)
                    atomic_json(root / "benchmarks" / f"v{version:06d}.json", measured)
                    report({"benchmark": measured["opponents"]})
                report(
                    {
                        "phase": "evaluated",
                        "evaluation": {key: val for key, val in result.items() if key != "games"},
                        "champion": league["champion"],
                    }
                )
            state["completedGenerations"] += 1
            report({"phase": "generation_complete"})
        report({"phase": "stopped"})
        return state
    except Exception as error:
        report({"phase": "failed", "error": str(error)})
        raise
    finally:
        for sig, handler in signal_handlers.items():
            signal.signal(sig, handler)
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
