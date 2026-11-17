import argparse
import json
import os
from pathlib import Path

from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR

from .league.champions import checkpoint, export_policy
from .league.loop import run
from .policy.network import Policy
from .sim import balance, catalogue_build
from .sim.verification import verify
from .study.curriculum import build
from .study.export import export
from .training.benchmark import benchmark
from .training.parallel import MAX_WORKERS
from .training.storage import read_episode

DATA = DATA_DIR
CONTROL = DATA / "arena/control"


def arguments():
    parser = argparse.ArgumentParser(
        description="Local battle self-play, lookahead and version qualification"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("start")
    start.add_argument("--hours", type=float, default=8)
    start.add_argument("--generations", type=int, default=0)
    start.add_argument("--games", type=int, default=4)
    start.add_argument("--simulations", type=int, default=16)
    start.add_argument("--depth", type=int, default=6)
    start.add_argument("--pairs", type=int, default=16)
    start.add_argument("--evaluate-every", type=int, default=1)
    start.add_argument("--workers", type=int, default=1)
    commands.add_parser("status")
    commands.add_parser("stop")
    commands.add_parser(
        "verify", help="Check native pool/interactions; this does not certify live-client parity"
    )
    exported = commands.add_parser("export")
    exported.add_argument("--samples", type=int, default=8)
    live = commands.add_parser("policy", help="Write one checkpoint for counterpush play --policy")
    live.add_argument("--version", type=int, required=True)
    commands.add_parser(
        "catalogue", help="Write contracts/card-catalogue.json from the pinned table"
    )
    measured = commands.add_parser(
        "benchmark", help="Score a checkpoint against the fixed rule bots"
    )
    measured.add_argument("--version", type=int)
    measured.add_argument("--pairs", type=int, default=8)
    rules = commands.add_parser("rules")
    rules.add_argument("--stage-version")
    curriculum = commands.add_parser("curriculum")
    curriculum.add_argument("--positions", type=int, default=64)
    curriculum.add_argument("--seed", type=int, default=1000)
    curriculum.add_argument("--split", choices=["train", "holdout"], default="train")
    return parser, parser.parse_args()


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


def curriculum(args, parser):
    if not 1 <= args.positions <= 256:
        parser.error("Generate 1..256 tactical positions per run")
    return build(DATA, args.positions, args.seed, args.split)


def export_dataset(args, parser):
    if not 1 <= args.samples <= 16:
        parser.error("Export 1..16 positions per Qwen study batch")
    _root, league = active_league()
    episodes = [read_episode(path) for path in league["episodes"][-4:]]
    return {"dataset": export(DATA, episodes, args.samples)}


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


def status(args, _parser):
    path = CONTROL / "status.json"
    if not path.exists():
        return {"running": False, "phase": "not_started"}
    result = json.loads(path.read_text())
    try:
        os.kill(result["pid"], 0)
        alive = True
    except ProcessLookupError:
        alive = False
    result["running"] = alive and result["phase"] not in ("stopped", "failed")
    if args.command != "stop":
        return result
    atomic_json(CONTROL / "stop.json", {"id": result["id"]})
    return {
        "stopRequested": result["running"],
        "after": "the current complete game/evaluation pair and training checkpoint",
    }


COMMANDS = {
    "start": start,
    "status": status,
    "stop": status,
    "verify": verification,
    "export": export_dataset,
    "policy": live_policy,
    "catalogue": lambda _args, _parser: catalogue_build.write(),
    "benchmark": measure,
    "rules": rules,
    "curriculum": curriculum,
}


def main():
    parser, args = arguments()
    result = COMMANDS[args.command](args, parser)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
