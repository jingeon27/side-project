"""Trophy labels, data capture, replay evaluation and supervised recognition through one entry point."""

import argparse
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    ops = parser.add_subparsers(dest="command", required=True)
    load = ops.add_parser("label-import")
    load.add_argument("source", type=Path)
    ops.add_parser("label-status")
    ops.add_parser("label-maintain")
    ops.add_parser("perception-eval")
    ops.add_parser("perception-identity")
    ops.add_parser("card-status").add_argument("--card")
    ui = ops.add_parser("label")
    ui.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    if args.command == "label":
        from clash_bot.perception.labels.workbench import review_server

        return review_server(args.port, Path(os.environ["CLASH_REVIEW_JS"]).read_bytes())
    if args.command == "perception-identity":
        from clash_bot.perception.labels.learning import EVAL, active_head
        from clash_bot.perception.labels.reader import DETECTOR, REFERENCES, identity

        encoder = identity(DETECTOR, REFERENCES)
        _, head = active_head(EVAL, encoder)
        result = {"reader": encoder, "head": head}
    elif args.command == "perception-eval":
        from clash_bot.perception.labels.learning import evaluate

        result = evaluate()
    elif args.command == "card-status":
        from clash_bot.perception.labels.cards import card_status

        result = card_status(args.card)
    else:
        from clash_bot.perception.labels.maintenance import ingest, maintain, progress

        if args.command == "label-import":
            if not args.source.is_dir():
                parser.error("Missing trophy run or experiments directory")
            result = ingest(args.source.resolve())
        elif args.command == "label-status":
            result = progress()
        else:
            result = maintain()
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
