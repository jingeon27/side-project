import argparse
import json
import os
from pathlib import Path

from clash_bot.paths import DATA_DIR

from . import balance
from .curriculum import build
from .export import export
from .league import run
from .storage import atomic_json, read_episode

DATA = DATA_DIR


def main():
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
    commands.add_parser("status")
    commands.add_parser("stop")
    exported = commands.add_parser("export")
    exported.add_argument("--samples", type=int, default=8)
    rules = commands.add_parser("rules")
    rules.add_argument("--stage-version")
    curriculum = commands.add_parser("curriculum")
    curriculum.add_argument("--positions", type=int, default=64)
    curriculum.add_argument("--seed", type=int, default=1000)
    curriculum.add_argument("--split", choices=["train", "holdout"], default="train")
    start.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    control = DATA / "arena/control"
    if args.command == "start":
        if not (
            0 <= args.hours <= 24
            and 0 <= args.generations <= 10000
            and 1 <= args.games <= 64
            and 2 <= args.simulations <= 512
            and 2 <= args.depth <= 32
            and 1 <= args.pairs <= 256
            and 1 <= args.evaluate_every <= 100
            and 1 <= args.workers <= 4
        ):
            parser.error("Invalid run bounds")
        result = run(
            DATA,
            args.hours,
            args.generations,
            args.games,
            args.simulations,
            args.depth,
            args.pairs,
            args.evaluate_every,
            args.workers,
        )
    elif args.command == "curriculum":
        if not 1 <= args.positions <= 256:
            parser.error("Generate 1..256 tactical positions per run")
        result = build(DATA, args.positions, args.seed, args.split)
    elif args.command == "export":
        if not 1 <= args.samples <= 16:
            parser.error("Export 1..16 positions per Qwen study batch")
        active = json.loads((control / "active.json").read_text())
        league = json.loads((Path(active["root"]) / "league.json").read_text())
        result = {
            "dataset": export(
                DATA, [read_episode(path) for path in league["episodes"][-4:]], args.samples
            )
        }
    elif args.command == "rules":
        result = (
            balance.stage(DATA, args.stage_version) if args.stage_version else balance.check(DATA)
        )
    else:
        path = control / "status.json"
        if not path.exists():
            result = {"running": False, "phase": "not_started"}
        else:
            result = json.loads(path.read_text())
            try:
                os.kill(result["pid"], 0)
                alive = True
            except ProcessLookupError:
                alive = False
            result["running"] = alive and result["phase"] not in ("stopped", "failed")
            if args.command == "stop":
                atomic_json(control / "stop.json", {"id": result["id"]})
                result = {
                    "stopRequested": result["running"],
                    "after": "the current complete game/evaluation pair and training checkpoint",
                }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
