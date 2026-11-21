"""Join the pinned client card table, reviewed references, measured recalls and deployment evidence."""

import json
from collections import Counter, defaultdict
from pathlib import Path

from clash_bot.card_specs import RULES, buff_records, combat_stats, engine_specs
from clash_bot.files import atomic_json
from clash_bot.paths import DATA_DIR
from clash_bot.perception.labels.reader import REFERENCES, checksum, references
from clash_bot.perception.labels.schema import CATALOGUE, UNKNOWN
from clash_bot.perception.labels.store import ROOT, database, labeled


def current_checks():
    path = DATA_DIR / "arena/control/active.json"
    if not path.exists():
        return {}
    active = json.loads(path.read_bytes())
    rules = (
        active.get("rulesID")
        or json.loads((Path(active["root"]) / "league.json").read_bytes())["rulesID"]
    )
    path = DATA_DIR / "arena/verification" / (rules + ".json")
    if not path.exists():
        return {}
    report = json.loads(path.read_bytes())
    return report["checks"] if report["table"] == RULES["tableVersion"] else {}


def card_status(selected=None):
    specs, checks = engine_specs(), current_checks()
    deployments = checks.get("catalogueBaseDeployment", {}).get("byCard", {})
    forms = checks.get("catalogueFormExecution", {}).get("byCard", {})
    shot_spawns = checks.get("buildingProjectileSpawnEligibility", {}).get("byEngine", {})
    if selected is not None:
        tower_names = {"princess_tower": "PrincessTower", "king_tower": "KingTower"}
        if selected in tower_names:
            row = next(t for t in specs["towers"] if t["name"] == tower_names[selected])
            verified = checks.get("crownTowerCombat", {})
            return {
                "id": selected,
                "tableVersion": specs["tableVersion"],
                "tableSHA256": specs["tableSHA256"],
                "raw": row,
                "baseCombat": combat_stats(row),
                "nativeByLevel": verified.get("byTower", {}).get(selected),
                **(
                    {"nativeApproachingKnight": verified.get("approachingKnight")}
                    if selected == "princess_tower"
                    else {}
                ),
                **(
                    {"nativeActivation": verified.get("kingActivation")}
                    if selected == "king_tower"
                    else {}
                ),
            }
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
        timing = checks.get("unitAttackTiming", {})
        waves = checks.get("spawnerWaves", {})
        death = checks.get("deathChildren", {}).get("byParent", {})
        return {
            "tableVersion": specs["tableVersion"],
            "tableSHA256": specs["tableSHA256"],
            "id": selected,
            **card,
            "unitSpecs": units,
            "nativeDeathSpawns": {n: sample for n, sample in death.items() if n in units},
            "buffSpecsByForm": {
                form: {
                    **{
                        n: (card["forms"][form].get("tables") or {}).get("buffs", {}).get(n)
                        or specs["buffs"][n]
                        for n in refs["buffs"]
                    },
                    **{b["name"]: b for b in buff_records(card["forms"][form])},
                }
                for form, refs in card["createdByForm"].items()
            },
            "nativeAttackTiming": {
                n: s for n, s in timing.get("alreadyDeployed", {}).items() if n in units
            },
            **(
                {
                    "nativeChargeInterruption": checks.get("ramChargeInterruption", {}).get(
                        "byParent"
                    )
                }
                if selected == "battle_ram"
                else {}
            ),
            **(
                {"nativeIceCube": checks.get("heroIceCubeControl")}
                if selected == "ice_wizard"
                else {}
            ),
            "nativeSpawning": {
                k: {n: s for n, s in waves.get(k, {}).items() if n in units}
                for k in ("periodic", "onDeath")
            },
            **(
                {
                    "nativeActivation": checks.get("hutActivation"),
                    "nativeFirstChildAttack": timing.get("firstChildOfActiveHut"),
                }
                if selected == "goblin_hut"
                else {}
            ),
            "baseDeployment": deployments.get(selected),
            "nativeProjectileSpawn": shot_spawns.get(card["engine"]),
            "formExecution": forms.get(selected),
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
            "baseDeployment": deployments.get(card),
            "nativeProjectileSpawn": shot_spawns.get(entry["engine"]),
            "formExecution": forms.get(card),
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
