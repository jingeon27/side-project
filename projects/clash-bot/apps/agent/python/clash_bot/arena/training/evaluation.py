"""Seat-swapped, disjoint-seed evaluation and explicit champion promotion gate."""

import math

import numpy as np
from more_itertools import chunked

from clash_bot.statistics import paired_win_probability

from ..sim.rules import DECKS, LIVE_DECK
from .selfplay import live_setup, play_game


def evaluation_setup(pair, generation):
    """Half live mirrors, half fixed threat decks, with both policies taking each seat/deck."""
    setup = live_setup(pair + generation)
    others = sorted(set(DECKS) - {LIVE_DECK})
    if pair % 2:
        setup["decks"][1] = others[(pair // 2 + generation) % len(others)]
    return setup


def paired_gate(pair_scores, minimum_pairs=16, alpha=0.05):
    if not pair_scores or any(
        not math.isfinite(score) or score < 0 or score > 1 for score in pair_scores
    ):
        return {"passed": False, "reason": "invalid_or_missing_pairs"}
    scores = np.array(pair_scores)
    won, lost = int(np.sum(scores > 0.5)), int(np.sum(scores < 0.5))
    decisive = won + lost
    probability = paired_win_probability(won, lost)
    rng = np.random.default_rng(1977)
    bootstrap = scores[rng.integers(0, len(scores), (4096, len(scores)))].mean(axis=1)
    interval = np.quantile(bootstrap, [alpha / 2, 1 - alpha / 2]).tolist()
    passed = (
        len(scores) >= minimum_pairs
        and decisive >= 8
        and float(scores.mean()) >= 0.55
        and interval[0] > 0.5
        and probability <= alpha
    )
    return {
        "passed": bool(passed),
        "pairs": len(scores),
        "score": float(scores.mean()),
        "confidenceInterval": interval,
        "pairWins": won,
        "pairLosses": lost,
        "pairTies": len(scores) - decisive,
        "oneSidedSignTestP": probability,
        "alpha": alpha,
        "reason": "qualified" if passed else "insufficient_evidence_of_improvement",
    }


def play_pair(challenger, champion, rules_id, identity, setup):
    """The challenger in each seat of the same world, as deployed: no training, no search."""
    games = []
    for seat in (0, 1):
        models = [champion, champion]
        models[seat] = challenger
        game = play_game(models, identity, rules_id, simulations=0, training=False, setup=setup)
        if not game["completed"] or game["rejectedCommands"]:
            raise ValueError("Unverified or invalid-action evaluation game")
        games.append({key: value for key, value in game.items() if key != "samples"})
    return games


def evaluate(
    challenger,
    champion,
    rules_id,
    generation,
    pairs=16,
    report=None,
    should_stop=None,
    play_pairs=None,
    batch=1,
):
    """Paired games as deployed, with the live deck and every configured threat deck.

    `play_pairs` plays up to `batch` pair jobs ({"identity", "setup"}) at once and returns each
    pair's two games in order; by default the pairs are played here one after another. Games are
    seeded by their identity, so the result does not depend on how they are scheduled.
    """
    for model in (challenger, champion):
        if model.metadata.get("rulesID", rules_id) != rules_id:
            raise ValueError("Evaluation policy belongs to another rule set")
    # Fixed sample budgets eventually cannot pass an alpha-spent exact test,
    # even with all wins. Increase the minimum before drawing holdout games.
    alpha = 0.05 / ((generation + 1) * (generation + 2))
    required_pairs = max(pairs, math.ceil(-math.log2(alpha)) + 1) if pairs >= 16 else pairs
    if pairs >= 16:
        required_pairs = max(required_pairs, 2 * (len(DECKS) - 1))
    play_pairs = play_pairs or (
        lambda jobs: [
            play_pair(challenger, champion, rules_id, job["identity"], job["setup"]) for job in jobs
        ]
    )
    jobs = [
        {
            "identity": f"holdout-{rules_id[:16]}-{generation}-{pair}",
            "setup": evaluation_setup(pair, generation),
        }
        for pair in range(required_pairs)
    ]
    results, pair_scores = [], []
    for group in chunked(jobs, batch):
        if should_stop and should_stop():
            break
        for games in play_pairs(group):
            scores = []
            for seat, game in enumerate(games):
                # Same world seed for the two seats.
                score = 0.5 if game["winner"] == 2 else 1 if game["winner"] == seat else 0
                scores.append(score)
                results.append(game | {"challengerSeat": seat, "score": score})
                if report:
                    report(
                        {
                            "phase": "evaluating",
                            "generation": generation,
                            "pair": len(pair_scores) + 1,
                            "seat": seat,
                            "score": score,
                        }
                    )
            pair_scores.append(sum(scores) / 2)
    # Alpha spending bounds false promotion probability over repeated generations.
    complete = len(pair_scores) == required_pairs
    gate = paired_gate(pair_scores, alpha=alpha)
    strata = {
        name: {
            "pairs": len(scores),
            "score": sum(scores) / len(scores) if scores else None,
        }
        for name, scores in (("liveMirror", pair_scores[::2]), ("mixedDeck", pair_scores[1::2]))
    }
    if gate["passed"] and any(
        row["score"] is None or row["score"] < 0.5 for row in strata.values()
    ):
        gate = {**gate, "passed": False, "reason": "matchup_stratum_regression"}
    if not complete:
        gate = {**gate, "passed": False, "reason": "interrupted_evaluation"}
    return {
        "format": "clash-arena-paired-eval-v2",
        "rulesID": rules_id,
        "generation": generation,
        "complete": complete,
        "challenger": {
            "version": challenger.metadata["version"],
            "weightsSHA256": challenger.checksum(),
        },
        "champion": {"version": champion.metadata["version"], "weightsSHA256": champion.checksum()},
        "seedDomain": "holdout",
        "trainingGamesIncluded": False,
        "matchupStrata": strata,
        "pairs": pair_scores,
        "games": results,
        "minimumPairs": pairs,
        "requestedPairs": required_pairs,
        "gate": gate,
    }


def pfsp_weights(win_rates):
    weights = np.array([max(0.05, (1 - rate) ** 2) for rate in win_rates], np.float64)
    return weights / weights.sum()
