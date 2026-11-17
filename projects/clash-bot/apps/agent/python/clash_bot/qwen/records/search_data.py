"""Validate a separate simulation-supervision contract, never on-policy PPO."""

import hashlib
import json
import math
from pathlib import Path


def conservation_frontier(gains, elixir):
    """Keep moves not dominated on measured tower HP and retained elixir.

    The existing 35-HP equivalence band is shared with tactical damage labels.
    No fixed exchange rate claims that one elixir is worth some invented HP.
    """
    return [
        not any(
            other_gain >= gain - 35
            and other_elixir >= mana
            and (other_elixir > mana or other_gain > gain + 35)
            for other_gain, other_elixir in zip(gains, elixir)
        )
        for gain, mana in zip(gains, elixir)
    ]


def load_search_targets(path):
    path = Path(path).resolve()
    raw = path.read_bytes()
    data = json.loads(raw)
    tactical = data.get("format") == "counterpush-tactical-targets-v4"
    if (
        not (
            (
                data.get("format") == "clash-arena-qwen-search-v1"
                and data.get("source") == "local_native_selfplay_public_before_state"
            )
            or (
                tactical
                and data.get("source") == "local_native_counterfactual_v3"
                and data.get("controllerVersion") == 3
            )
        )
        or data.get("teacherQualifiedForRealGame") is not False
    ):
        raise ValueError("Unknown or misrepresented simulation dataset")
    rows = data["samples"]
    if tactical and (data.get("split") != "train" or not 1 <= data.get("trainingEpochs", 1) <= 4):
        raise ValueError("Heldout or invalid-epoch tactical data cannot train")
    if not 1 <= len(rows) <= 16 or len({row["id"] for row in rows}) != len(rows):
        raise ValueError("Expected 1..16 distinct before-position search targets")
    for row in rows:
        target, choices = row["target"], row["choices"]
        if (
            row["rulesID"] != data["rulesID"]
            or not 2 <= len(choices) <= 26
            or len(set(choices)) != len(choices)
            or len(target) != len(choices)
            or any(not math.isfinite(p) or p < 0 for p in target)
            or abs(sum(target) - 1) > 1e-4
        ):
            raise ValueError("Invalid rule, terminal result or soft search target")
        if not tactical and (
            row["terminalOutcome"] not in (-1, 0, 1)
            or row["search"]["source"] != "public_history_information_set_puct"
            or row["search"]["simulations"] < 8
        ):
            raise ValueError("Unverified self-play outcome or search")
        if tactical:
            evidence = row["evidence"]
            gains = evidence["towerImprovement"]
            if (
                row.get("controllerVersion") != 3
                or evidence.get("kind")
                not in (
                    "paired_reactive_future_rollout",
                    "paired_reactive_elixir_conservation_rollout",
                )
                or evidence.get("actionOrder") != "seeded_permutation"
                or evidence.get("futureEnemyDeployments") != "hypothetical_policy_responses"
                or evidence.get("responsePolicy") != "public_sampled_world_defender_v1"
                or type(evidence.get("baselineEnemyDeployments")) is not int
                or evidence["baselineEnemyDeployments"] < 0
                or len(evidence.get("enemyDeploymentCounts", [])) != len(choices)
                or any(
                    type(count) is not int or count < 0
                    for count in evidence["enemyDeploymentCounts"]
                )
                or evidence.get("horizonTicks", 0) < 160
                or len(gains) != len(choices)
                or any(not math.isfinite(value) for value in gains)
                or abs(max(gains) - evidence["bestImprovement"]) > 1e-5
            ):
                raise ValueError("Unverified tactical improvement target")
            if evidence["kind"] == "paired_reactive_elixir_conservation_rollout":
                costs = evidence["elixirCosts"]
                elixir = evidence["retainedElixirMilli"]
                baseline = evidence["baselineElixirMilli"]
                if (
                    len(costs) != len(choices)
                    or any(type(cost) is not int or not 0 <= cost <= 10 for cost in costs)
                    or type(baseline) is not int
                    or not 0 <= baseline <= 10000
                    or len(elixir) != len(choices)
                    or any(type(mana) is not int or not 0 <= mana <= 10000 for mana in elixir)
                    or any(
                        not baseline - cost * 1000 <= mana <= baseline
                        for cost, mana in zip(costs, elixir)
                    )
                    or all(conservation_frontier(gains, elixir))
                    or any(
                        probability > 0 and not nondominated
                        for probability, nondominated in zip(
                            target, conservation_frontier(gains, elixir)
                        )
                    )
                ):
                    raise ValueError("Unverified elixir conservation target")
            elif max(gains) < 80 or any(
                probability > 0 and gain < max(gains) - 35
                for probability, gain in zip(target, gains)
            ):
                raise ValueError("Unverified tactical improvement target")
        image = (path.parent / row["image"]).resolve()
        if (
            image.parent != path.parent
            or hashlib.sha256(image.read_bytes()).hexdigest() != row["imageSHA256"]
        ):
            raise ValueError("Search before-image escaped its directory or changed")
    return data, hashlib.sha256(raw).hexdigest(), path
