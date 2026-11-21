import argparse
import json
import sys

from clash_bot.paths import DATA_DIR

from .league.status import format_status, read_status, request_stop


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
    status = commands.add_parser("status", help="Read the last local run without loading a model")
    output = status.add_mutually_exclusive_group()
    output.add_argument("--summary", action="store_true", help="Print a short terminal summary")
    output.add_argument("--json", action="store_true", help="Print the full status record")
    commands.add_parser("stop")
    commands.add_parser(
        "coverage",
        help="Card comparison, executed play and optimizer coverage for the active league",
    )
    commands.add_parser(
        "verify", help="Check native pool/interactions; this does not certify live-client parity"
    )
    live = commands.add_parser(
        "policy", help="Write one checkpoint as a live policy for trophy serve --seed"
    )
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
    return parser, parser.parse_args()


def main():
    parser, args = arguments()
    control = DATA_DIR / "arena/control"
    if args.command == "status":
        result = read_status(control)
        if args.summary or (sys.stdout.isatty() and not args.json):
            print(format_status(result))
            return
    elif args.command == "stop":
        result = request_stop(control)
    else:
        # Observing a run must also work on a machine without the native simulator.
        from .commands import COMMANDS

        result = COMMANDS[args.command](args, parser)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
