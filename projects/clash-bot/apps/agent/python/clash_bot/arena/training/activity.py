"""A frozen candidate must also start a game against itself before it can be promoted."""

from more_itertools import chunked

from .selfplay import live_setup


def opening_audit(generation, play_pairs, batch=1, should_stop=None):
    jobs = [
        {"identity": f"opening-holdout-{generation}-{pair}", "setup": live_setup(pair)}
        for pair in range(2)
    ]
    games = []
    for group in chunked(jobs, batch):
        if should_stop and should_stop():
            break
        for pair in play_pairs(group):
            if len(pair) != 2:
                raise ValueError("Opening audit requires both frozen seats")
            for game in pair:
                if not game["completed"] or game["rejectedCommands"]:
                    raise ValueError("Opening audit produced an unverified game")
                games.append(game)
    first = [
        next(
            (
                entry["tick"]
                for entry in game["publicHistory"]
                if any(play["action"][0] >= 0 for play in entry["plays"])
            ),
            None,
        )
        for game in games
    ]
    complete = len(games) == 4
    return {
        "tested": True,
        "passed": complete and all(tick is not None for tick in first),
        "complete": complete,
        "noPlayGames": sum(tick is None for tick in first),
        "firstCardTicks": first,
        "games": games,
        "trainingGamesIncluded": False,
    }
