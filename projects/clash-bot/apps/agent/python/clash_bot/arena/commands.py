"""Commands that use the native simulator or a league checkpoint."""

import json
from pathlib import Path

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR

from .league.champions import checkpoint, export_policy
from .league.loop import run
from .policy.network import Policy
from .sim.verification import verify
from .tables import balance, catalogue_build
from .training.benchmark import benchmark
from .training.parallel import MAX_WORKERS

DATA = DATA_DIR
CONTROL = DATA / "arena/control"


def active_league():
    root = Path(json.loads((CONTROL / "active.json").read_text())["root"])
    return root, json.loads((root / "league.json").read_text())


def start(args, parser):
    if not (
        0 <= args.hours <= 24
        and 0 <= args.generations <= 10000
        and 1 <= args.games <= 64
        and 2 <= args.simulations <= 512
        and 2 <= args.depth <= 32
        and 1 <= args.pairs <= 256
        and 1 <= args.evaluate_every <= 100
        and 1 <= args.workers <= MAX_WORKERS
    ):
        parser.error("Invalid run bounds")
    return run(
        DATA,
        hours=args.hours,
        generations=args.generations,
        games=args.games,
        simulations=args.simulations,
        depth=args.depth,
        pairs=args.pairs,
        evaluate_every=args.evaluate_every,
        workers=args.workers,
    )


def verification(_args, _parser):
    result = verify(DATA)
    if not result["passed"]:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    return result


def measure(args, parser):
    if not 1 <= args.pairs <= 64:
        parser.error("Play 1..64 seat-swapped pairs per rule bot")
    root, league = active_league()
    version = league["champion"] if args.version is None else args.version
    policy = Policy.load(checkpoint(root, version), league["rulesID"])
    result = benchmark(policy, league["rulesID"], pairs=args.pairs)
    atomic_json(root / "benchmarks" / f"v{version:06d}.json", result)
    return result


def live_policy(args, parser):
    if args.version < 0:
        parser.error("Checkpoint versions start at 0")
    root, _league = active_league()
    return export_policy(root, args.version)


def rules(args, _parser):
    return balance.stage(DATA, args.stage_version) if args.stage_version else balance.check(DATA)


COMMANDS = {
    "start": start,
    "verify": verification,
    "policy": live_policy,
    "catalogue": lambda _args, _parser: catalogue_build.write(),
    "benchmark": measure,
    "rules": rules,
}
