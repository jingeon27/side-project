"""The league pointer (league.json), its checkpoints and the champion files live play reads.

A league starts from the previous rule set's champion when the policy format matches, resumes only
the current league.json, and republishes the champion's live policy whenever it changes.
"""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from clash_bot.files import atomic_json

from ..policy.network import LEAGUE_KEY, Policy


class Opponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=0)
    # A draw counts half a win.
    wins: float = Field(ge=0)
    games: int = Field(ge=0)


class LeagueState(BaseModel):
    """league.json: the learner, the qualified champion and the frozen opponent pool."""

    model_config = ConfigDict(extra="forbid")

    format: Literal["clash-arena-league-v1"]
    rulesID: str
    learner: int = Field(ge=0)
    champion: int = Field(ge=0)
    evaluations: int = Field(ge=0)
    episodes: list[str]
    opponents: list[Opponent] = Field(min_length=1)


def initialize(root, rules, parent=None):
    """Resume this rule set's league, or start it from the champion of the league before it.

    A balance patch changes some cards' numbers and sometimes their mechanics. Starting from
    the previous champion keeps what still holds, and self-play under the new rules relearns
    the rest. Games, replays and evaluations of other rules are never mixed in.
    """
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    pointer = root / "league.json"
    if pointer.exists():
        league = LeagueState.model_validate_json(pointer.read_text()).model_dump()
        if league["rulesID"] != rules["id"]:
            raise ValueError("Create a separate league directory for changed battle rules")
        publish_champion(root, league)  # Repairs a stop between a promotion and its live file.
        return league
    atomic_json(root / "rules.json", rules)
    initial = checkpoint(root, 0)
    if initial.exists():
        Policy.load(initial, rules["id"])  # Recover a crash before first pointer publication.
    else:
        inherited, used_evaluations = parent_champion(parent)
        if inherited:
            policy = Policy(
                weights=inherited.weights, metadata={"version": 0, "rulesID": rules["id"]}
            )
            source = {
                key: inherited.metadata[key] for key in ("rulesID", "version", "weightsSHA256")
            }
            policy.save(
                initial,
                {
                    "role": "inherited_champion",
                    "inheritedFrom": source,
                    "evaluationOffset": used_evaluations,
                },
            )
        else:
            policy = Policy(metadata={"version": 0, "rulesID": rules["id"]})
            policy.save(initial, {"role": "initial_random_policy"})
    league = LeagueState(
        format="clash-arena-league-v1",
        rulesID=rules["id"],
        learner=0,
        champion=0,
        evaluations=0,
        episodes=[],
        opponents=[Opponent(version=0, wins=0, games=0)],
    ).model_dump()
    store(root, league)
    publish_champion(root, league)
    return league


def checkpoint(root, version):
    return Path(root) / "checkpoints" / f"v{version:06d}"


def learner_history(root, league):
    """Only updates reachable from the committed learner, including gaps left by a crash."""
    version = league["learner"]
    while version:
        row = json.loads((checkpoint(root, version) / "metadata.json").read_bytes())
        if (
            row["rulesID"] != league["rulesID"]
            or row["version"] != version
            or not 0 <= row["parent"] < version
        ):
            raise ValueError("Broken learner checkpoint lineage")
        yield row
        version = row["parent"]


def store(root, league):
    """Write league.json; the owner calls this after every change it must not lose."""
    atomic_json(Path(root) / "league.json", league)


def parent_champion(parent):
    """Carry verified weights and the next unused evaluation number."""
    if parent is None:
        return None, 0
    parent = Path(parent)
    if not parent.name.endswith(f"-{LEAGUE_KEY}") or not (parent / "league.json").exists():
        return None, 0
    league = LeagueState.model_validate_json((parent / "league.json").read_text())
    # Verifies format, rule set, network layout and checksum; a broken parent stops the start.
    return (
        Policy.load(checkpoint(parent, league.champion), league.rulesID),
        evaluation_offset(parent) + league.evaluations,
    )


def evaluation_offset(root):
    metadata = json.loads((checkpoint(root, 0) / "metadata.json").read_bytes())
    return metadata.get("evaluationOffset", 0)


def catalogue_of(root):
    """The card catalogue this league's rule set was created with (its rules.json)."""
    return json.loads((Path(root) / "rules.json").read_text())["catalogue"]


def publish_champion(root, league):
    """Write the champion's live policy, the file `trophy serve --seed` and the loop read."""
    policy = Policy.load(checkpoint(root, league["champion"]), league["rulesID"])
    atomic_json(Path(root) / "champion-policy.json", policy.live(catalogue_of(root)), compact=True)


def export_policy(root, version):
    """Write one checkpoint's live policy for `trophy serve --seed`."""
    league = LeagueState.model_validate_json((Path(root) / "league.json").read_text())
    policy = Policy.load(checkpoint(root, version), league.rulesID)
    path = Path(root) / "policies" / f"v{version:06d}.json"
    atomic_json(path, policy.live(catalogue_of(root)), compact=True)
    return {"policy": str(path), "version": version, "weightsSHA256": policy.checksum()}
