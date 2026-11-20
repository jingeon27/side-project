"""Join the pinned client card table, reviewed references, measured recalls and deployment evidence."""

import json
from collections import Counter, defaultdict
from pathlib import Path

from clash_bot.card_specs import RULES, combat_stats, engine_specs
from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR
from clash_bot.perception.labels.reader import REFERENCES, checksum, references
from clash_bot.perception.labels.schema import CATALOGUE, UNKNOWN
from clash_bot.perception.labels.store import ROOT, database, labeled


def card_status(selected=None):
    specs = engine_specs()
    if selected is not None:
        card = specs["cards"].get(selected)
        if card is None:
            raise ValueError("Unknown catalogue card: " + selected)
        units = {}
        for form, created in card["createdByForm"].items():
            local = card["forms"][form].get("tables", {}).get("units", {})
            for name in created["units"]:
                if name in local:
                    units[name] = {
                        "raw": local[name],
                        "combat": combat_stats(local[name]),
                        "body": CATALOGUE["units"].get(name),
                    }
                else:
                    units[name] = specs["units"][name]
        return {
            "tableVersion": specs["tableVersion"],
            "tableSHA256": specs["tableSHA256"],
            "id": selected,
            **card,
            "unitSpecs": units,
        }
    refs = defaultdict(list)
    if (REFERENCES / "manifest.json").exists():
        for card, path in references(REFERENCES):
            refs[card].append({"image": path.name, "sha256": checksum(path)})
    counts = Counter()
    samples = defaultdict(list)
    with database() as db:
        for row in labeled(db):
            label = json.loads(row["label"])
            for obj in label["objects"]:
                if obj["kind"] != UNKNOWN and len(samples[obj["kind"]]) < 8:
                    samples[obj["kind"]].append(
                        {
                            "frameSHA256": row["sha"],
                            "split": row["split"],
                            "reviewer": label["reviewer"],
                            **obj,
                        }
                    )
            counts.update(
                (row["split"], o["kind"], o["side"])
                for o in label["objects"]
                if o["kind"] != UNKNOWN
            )
    report = DATA_DIR / "trophy/perception-eval/latest.json"
    measured = (
        json.loads(report.read_bytes())["reports"]["pilot"]["baseline"]["bodyRecallByKind"]
        if report.exists()
        else {}
    )
    active = DATA_DIR / "arena/control/active.json"
    league = (
        json.loads((Path(json.loads(active.read_bytes())["root"]) / "league.json").read_bytes())
        if active.exists()
        else {}
    )
    verification = DATA_DIR / "arena/verification" / (str(league.get("rulesID")) + ".json")
    checks = json.loads(verification.read_bytes())["checks"] if verification.exists() else {}
    pool = {name for deck in RULES["decks"].values() for name in deck["cards"]}
    bodies = {
        body: {
            "coverage": {side: counts["coverage", body, side] for side in ["blue", "red"]},
            "measurement": {side: counts["measurement", body, side] for side in ["blue", "red"]},
            "visibleExamples": samples[body],
            "measuredRecall": measured.get(body),
        }
        for body in CATALOGUE["bodies"]
        if body != "?"
    }
    cards = {
        card: {
            "engine": entry["engine"],
            "forms": list(entry["forms"]),
            "objects": entry["objects"],
            "reviewedHandReferences": refs[card],
            "fieldAppearance": "pending_review",
            "baseDeployment": checks.get("catalogueBaseDeployment", {}).get("byCard", {}).get(card),
            "poolDeploymentVerified": bool(checks.get("poolDeploymentsAndElixir", {}).get("passed"))
            if entry["engine"] in pool
            else None,
            "realClientParityVerified": None,
        }
        for card, entry in specs["cards"].items()
    }
    result = {
        "tableVersion": specs["tableVersion"],
        "cards": cards,
        "bodies": bodies,
        "unlinkedBodies": specs["unlinkedBodies"],
        "objectOrigins": specs["objectOrigins"],
    }
    atomic_json(ROOT / "card-status.json", result)
    return {
        "cards": len(cards),
        "bodies": len(bodies),
        "unlinkedBodies": specs["unlinkedBodies"],
        "withHandReferences": len([v for v in refs.values() if v]),
        "file": str(ROOT / "card-status.json"),
    }
