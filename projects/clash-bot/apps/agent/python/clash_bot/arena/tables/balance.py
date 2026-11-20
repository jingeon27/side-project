"""Detect/stage upstream changes; never silently mutate a running battle core."""

import hashlib
import json
import re
import tarfile
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

from clash_bot.files import atomic_json

from ..sim.rules import CARDS, SPEC, rules_identity

OFFICIAL = "https://supercell.com/en/games/clashroyale/blog/"
PYPI = "https://pypi.org/pypi/royalesim/json"


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()


class Articles(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href", "")
            self.current = [href, []] if "/games/clashroyale/blog/" in href else None

    def handle_data(self, data):
        if self.current:
            self.current[1].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current:
            href, words = self.current
            self.current = None
            label = " ".join(" ".join(words).split())
            if "balance" in label.lower() and "merge" not in label.lower():
                self.links.append(
                    {
                        "title": label,
                        "url": "https://supercell.com" + href if href.startswith("/") else href,
                    }
                )


def old_enough(asset, now=None):
    now = now or datetime.now(timezone.utc)
    uploaded = datetime.fromisoformat(asset["upload_time_iso_8601"].replace("Z", "+00:00"))
    return (now - uploaded).total_seconds() >= 86400 and not asset.get("yanked", False)


def changed_fields(before, after, path=""):
    if isinstance(before, dict) and isinstance(after, dict):
        return [
            row
            for key in sorted(before.keys() | after.keys())
            for row in changed_fields(before.get(key), after.get(key), f"{path}.{key}".strip("."))
        ]
    return [] if before == after else [{"field": path, "before": before, "after": after}]


def is_number(value):
    return isinstance(value, int | float) and not isinstance(value, bool)


def classify(before_rows, after_rows):
    """Per changed card, unit or effect: only numbers moved ("stats") or behavior did ("mechanics").

    A patch usually retunes a few numbers, which the engine table and a league that starts from
    the current champion absorb. Added or removed objects and fields, or changed text, lists or
    flags, are mechanics that the engine and the card contracts must support first.
    """
    objects = []
    for key in sorted(before_rows.keys() | after_rows.keys()):
        fields = changed_fields(before_rows.get(key), after_rows.get(key), key)
        if fields:
            stats = all(is_number(row["before"]) and is_number(row["after"]) for row in fields)
            objects.append(
                {"object": key, "kind": "stats" if stats else "mechanics", "fields": fields}
            )
    return objects


def relevant_rows(table):
    # A new opponent card's projectile/death-spawn/buff can change a matchup too.
    # Diff every named object instead of only substrings of the live eight-card deck.
    rows = {}
    for group in (
        "cards",
        "units",
        "evolutions",
        "hero_forms",
        "projectiles",
        "area_effect_objects",
        "buffs",
    ):
        source = table.get(group, {})
        source = source.values() if isinstance(source, dict) else source
        for row in source:
            if not isinstance(row, dict):
                continue
            name = row.get("name", "")
            if name:
                rows[f"{group}.{name}"] = row
    for group in ("globals", "towers"):
        if group in table:
            rows[group] = table[group]
    return rows


def stage(data_dir, version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Expected a stable numeric engine version")
    metadata = json.loads(fetch(f"https://pypi.org/pypi/royalesim/{version}/json"))
    assets = metadata["urls"]
    source_asset = next(row for row in assets if row["filename"].endswith(".tar.gz"))
    wheel = next(
        row
        for row in assets
        if row["filename"].endswith("macosx_11_0_arm64.whl") and "abi3" in row["filename"]
    )
    if not all(old_enough(row) for row in (source_asset, wheel)):
        raise ValueError("Stable source and Mac wheel must both be at least 24 hours old")
    root = Path(data_dir) / "arena/rules/staged" / version
    root.mkdir(parents=True, exist_ok=True)
    source = root / source_asset["filename"]
    payload = fetch(source_asset["url"])
    if hashlib.sha256(payload).hexdigest() != source_asset["digests"]["sha256"]:
        raise ValueError("Source archive checksum mismatch")
    source.write_bytes(payload)
    with tarfile.open(source) as archive:
        tables = [
            member
            for member in archive.getmembers()
            if re.fullmatch(r"[^/]+/data/derived/cards-\d+-\d{8}\.json", member.name)
            and member.isfile()
        ]
        if not tables:
            raise ValueError(
                "New engine contains no recognized dated client table; manual adapter update required"
            )
        latest = max(tables, key=lambda member: member.name.rsplit("-", 1)[-1])
        raw = archive.extractfile(latest).read()
    table = json.loads(raw)
    output = root / Path(latest.name).name
    output.write_bytes(raw)
    base = Path(data_dir) / "arena/rules/source" / SPEC["tableFile"]
    if not base.exists():
        raise ValueError("Run arena:setup first to verify the pinned source table")
    if hashlib.sha256(base.read_bytes()).hexdigest() != SPEC["tableSHA256"]:
        raise ValueError("Pinned baseline table was changed locally")
    changes = classify(relevant_rows(json.loads(base.read_text())), relevant_rows(table))
    mechanics = [row["object"] for row in changes if row["kind"] == "mechanics"]
    missing = sorted(set(CARDS) - {row["name"] for row in table.get("cards", [])})
    candidate = {
        "format": "clash-arena-rules-candidate-v2",
        "version": version,
        "wheel": wheel["filename"],
        "wheelSHA256": wheel["digests"]["sha256"],
        "sourceSHA256": source_asset["digests"]["sha256"],
        "tableFile": output.name,
        "tableVersion": table["version"],
        "tableSHA256": hashlib.sha256(raw).hexdigest(),
        "baseRulesID": rules_identity()["id"],
        "changes": changes,
        "mechanicsChanged": mechanics,
        "missingCards": missing,
        "activated": False,
        # Numbers only: pin the new engine and the next arena start continues from the champion.
        "status": (
            "requires_engine_support_and_contract_tests"
            if mechanics or missing
            else "requires_engine_pin_update"
        ),
        "requiredChecks": [
            "arena verify and pool-wide deployment/forms/spawns contracts",
            "public information masking",
            "seat-swapped heldout evaluation",
            "live Trophy screen parity",
        ],
        "note": "Data changes do not establish implemented mechanics. New effects require engine support.",
    }
    atomic_json(root / "candidate.json", candidate)
    return candidate


def check(data_dir):
    result = {
        "format": "clash-arena-balance-watch-v1",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "active": rules_identity(),
        "automaticActivation": False,
        "errors": [],
    }
    try:
        metadata = json.loads(fetch(PYPI))
        versions = [
            version
            for version, assets in metadata["releases"].items()
            if re.fullmatch(r"\d+\.\d+\.\d+", version) and any(old_enough(row) for row in assets)
        ]
        latest = max(versions, key=lambda version: tuple(map(int, version.split("."))))
        result.update(
            {"upstreamVersion": latest, "engineUpdateAvailable": latest != SPEC["version"]}
        )
    except Exception as error:
        result["errors"].append({"source": PYPI, "error": str(error)})
    try:
        parser = Articles()
        parser.feed(fetch(OFFICIAL).decode())
        result["officialBattleBalanceArticles"] = list(
            {row["url"]: row for row in parser.links}.values()
        )[:6]
        result["officialNoticeRequiresReview"] = True
    except Exception as error:
        result["errors"].append({"source": OFFICIAL, "error": str(error)})
    atomic_json(Path(data_dir) / "arena/rules/checks/latest.json", result)
    return result
