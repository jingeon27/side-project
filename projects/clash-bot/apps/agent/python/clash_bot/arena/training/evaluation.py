"""Seat-swapped, disjoint-seed evaluation and explicit champion promotion gate."""

import math

import numpy as np
from more_itertools import chunked

from clash_bot.statistics import paired_win_probability

from ..sim.rules import LIVE_DECK, POOL_DECKS
from .selfplay import live_setup, play_game


def evaluation_setup(pair, generation):
    """Half live mirrors, half fixed threat decks, with both policies taking each seat/deck."""
    setup = live_setup(pair + generation)
    if pair % 2:
        index = pair // 2 + generation
        setup["decks"][1 - index % 2] = POOL_DECKS[index % len(POOL_DECKS)]
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


def heldout_game(models, rules_id, identity, setup):
    game = play_game(models, identity, rules_id, simulations=0, training=False, setup=setup)
    if not game["completed"] or game["rejectedCommands"]:
        raise ValueError("Unverified or invalid-action evaluation game")
    return {key: value for key, value in game.items() if key != "samples"}


def play_pair(challenger, champion, rules_id, identity, setup):
    """The challenger in each seat of the same world, as deployed: no training, no search."""
    games = []
    for seat in (0, 1):
        models = [champion, champion]
        models[seat] = challenger
        games.append(heldout_game(models, rules_id, identity, setup))
    return games


def play_matchup(challenger, champion, rules_id, identity, setup):
    pair = play_pair(challenger, champion, rules_id, identity, setup)
    control = None
    if setup["decks"][0] != setup["decks"][1]:
        control = heldout_game([champion, champion], rules_id, identity, setup)
    return pair, control


def seat_score(game, seat):
    return 0.5 if game["winner"] == 2 else int(game["winner"] == seat)


def pool_comparison(controls):
    def summarize(games):
        count = len(games)
        return {
            "games": count,
            "challengerScore": sum(g["challengerScore"] for g in games) / count if count else None,
            "championScore": sum(g["score"] for g in games) / count if count else None,
        }

    overall = summarize(controls)
    return {
        **overall,
        "nonRegressing": bool(controls) and overall["challengerScore"] >= overall["championScore"],
        "byDeck": {
            deck: summarize([g for g in controls if g["poolDeck"] == deck]) for deck in POOL_DECKS
        },
    }


def evaluate(
    challenger,
    champion,
    rules_id,
    generation,
    pairs=16,
    report=None,
    should_stop=None,
    play_matchups=None,
    batch=1,
):
    """Paired games as deployed, with the live deck and every configured threat deck.

    Each job returns two scored matches and, for a mixed matchup, an incumbent-only control
    on the same decks, physical seats, clocks and world. Controls never enter the paired win test.
    """
    for model in (challenger, champion):
        if model.metadata.get("rulesID", rules_id) != rules_id:
            raise ValueError("Evaluation policy belongs to another rule set")
    # Fixed sample budgets eventually cannot pass an alpha-spent exact test,
    # even with all wins. Increase the minimum before drawing holdout games.
    alpha = 0.05 / ((generation + 1) * (generation + 2))
    required_pairs = max(pairs, math.ceil(-math.log2(alpha)) + 1) if pairs >= 16 else pairs
    if pairs >= 16:
        required_pairs = max(required_pairs, 2 * len(POOL_DECKS))
    play_matchups = play_matchups or (
        lambda jobs: [
            play_matchup(challenger, champion, rules_id, job["identity"], job["setup"])
            for job in jobs
        ]
    )
    jobs = [
        {
            "identity": f"holdout-{rules_id[:16]}-{generation}-{pair}",
            "setup": evaluation_setup(pair, generation),
        }
        for pair in range(required_pairs)
    ]
    results, pair_scores, controls = [], [], []
    for group in chunked(jobs, batch):
        if should_stop and should_stop():
            break
        for job, (games, control) in zip(group, play_matchups(group), strict=True):
            decks = job["setup"]["decks"]
            if len(games) != 2 or (control is None) != (decks[0] == decks[1]):
                raise ValueError("Incomplete seat pair or missing same-deck control")
            scores = []
            for seat, game in enumerate(games):
                # Same world seed for the two seats.
                score = seat_score(game, seat)
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
            if control is not None:
                pool_seat = 1 - decks.index(LIVE_DECK)
                controls.append(
                    {
                        **control,
                        "poolSeat": pool_seat,
                        "poolDeck": decks[pool_seat],
                        "score": seat_score(control, pool_seat),
                        "challengerScore": scores[pool_seat],
                    }
                )
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
    pool = pool_comparison(controls)
    if gate["passed"] and not pool["nonRegressing"]:
        gate = {**gate, "passed": False, "reason": "pool_deck_regression"}
    if not complete:
        gate = {**gate, "passed": False, "reason": "interrupted_evaluation"}
    return {
        "format": "clash-arena-paired-eval-v3",
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
        "poolComparison": pool,
        "poolControlGames": controls,
        "pairs": pair_scores,
        "games": results,
        "minimumPairs": pairs,
        "requestedPairs": required_pairs,
        "gate": gate,
    }


def pfsp_weights(win_rates):
    weights = np.array([max(0.05, (1 - rate) ** 2) for rate in win_rates], np.float64)
    return weights / weights.sum()
