"""One generation: frozen self-play games, then one learner update saved as a new candidate."""

import json
import shutil
import uuid
from itertools import chain

import numpy as np
from more_itertools import chunked

from ..sim.rules import LIVE_DECK
from ..training.coverage import card_coverage
from ..training.deck_practice import schedule_deck
from ..training.evaluation import pfsp_weights
from ..training.parallel import play_frozen_game
from ..training.pressure import schedule_pressure
from ..training.public_value import fit
from ..training.replay import replay_coverage, replay_samples
from ..training.selfplay import SELFPLAY, live_setup, setup_for
from ..training.storage import read_episode, replay_path, seed_for, write_episode, write_replay
from .champions import checkpoint, store
from .practice import focused_jobs, practice_history

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
        slot_in_cycle = index % every
        cycle = (version - 1) * ((settings["games"] + every - 1) // every) + index // every
        scripted = slot_in_cycle == every - 1
        learner_mirror = slot_in_cycle == 1 and not scripted
        rates = [(row["wins"] + 1) / (row["games"] + 2) for row in league["opponents"]]
        selected = (
            None
            if slot_in_cycle == 0 or learner_mirror or scripted
            else league["opponents"][int(rng.choice(len(rates), p=pfsp_weights(rates)))]
        )
        opponent = league["champion"] if selected is None else selected["version"]
        game_id = f"train-{version}-{index}-{uuid.uuid4().hex[:8]}"
        setup = setup_for(game_id)
        seat = (version + index // (every if scripted else 2)) % 2
        if learner_mirror:
            seat = cycle % 2
        if scripted:
            slot = index // every
            setup = schedule_pressure(
                setup,
                (version - 1) * (settings["games"] // every) + slot,
                seat,
                (version + slot // 2) % 2 == 1,
            )
        elif slot_in_cycle == 0:
            slots = (settings["games"] + every - 1) // every
            setup = schedule_deck(setup, (version - 1) * slots + index // every, seat)
        elif learner_mirror:
            setup = live_setup(seed_for("training-mirror", game_id))
        elif slot_in_cycle == 2 and cycle % 2 == 0:
            exercise = cycle // 2
            seat = exercise % 2
            setup = {
                **setup,
                "decks": [LIVE_DECK, LIVE_DECK],
                "practiceDeck": LIVE_DECK,
                "practiceLead": "Graveyard",
                "offensePractice": True,
                "offenseOpening": {
                    "seat": seat,
                    "right": bool((exercise // 4 + seat) % 2),
                    "knight": exercise // 2 % 2 == 0,
                },
            }
        jobs.append(
            {
                "current": str(checkpoint(root, league["champion"])),
                "collector": str(checkpoint(root, league["learner"])) if learner_mirror else None,
                "labelReference": str(checkpoint(root, league["learner"])),
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
    parent = json.loads((checkpoint(root, league["learner"]) / "metadata.json").read_bytes())
    leaf_weights = parent.get("training", {}).get("publicLeaf", {}).get("weights")
    focus = focused_jobs(root, league, rules, version, settings.get("practiceGames", 0))
    regular = scheduled(root, league, rules, version, range(games), settings, rng)
    for jobs in chunked(chain(focus, regular), workers.count):
        if control.stopped():
            break
        for job in jobs:
            job["leafWeights"] = leaf_weights
        control.report(
            {
                "phase": "selfplay",
                "game": len(played) + 1,
                "scheduledGames": len(focus) + games,
                "practiceGoals": [
                    j["setup"]["focusGoal"] for j in jobs if "focusGoal" in j["setup"]
                ],
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
                    "game": len(played),
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
    _, _, recent_practice = practice_history(root, league, persist=True)
    paths = dict.fromkeys([*league["episodes"][-REPLAY_EPISODES:], *recent_practice.values()])
    history = [read_episode(replay_path(path)) for path in paths]
    samples = replay_samples(
        history, rules["id"], max_samples=REPLAY_SAMPLES, seed=seed_for("replay", version)
    )
    training = learner.train(samples, seed=seed_for("optimizer", version))
    training["publicLeaf"] = fit(history, rules["id"])
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
