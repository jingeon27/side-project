"""Generate practice decks for verified cards missing from the live matchup suite."""

from math import ceil

from clash_bot.paths import CONTRACTS_DIR

from ..sim.card_checks import catalogue_deployments
from ..sim.form_checks import verified_forms

PATH = CONTRACTS_DIR / "arena-practice.json"
ANCHORS = ("Knight", "Archer", "Zap", "Giant", "Minions", "Fireball", "Skeletons", "Musketeer")


def form_decks(specs, standard, receipts):
    equipped = {(c, f) for d in standard.values() for c, f in zip(d["cards"], d["forms"])}
    costs = {
        row["engine"]: (row["forms"].get("base") or row["forms"]["champion"])["elixir"]
        for row in specs["cards"].values()
    }
    groups = []
    for kind, form, limit in (("evolution", 1, 2), ("hero", 2, 1)):
        eligible = [
            specs["cards"][card]["engine"]
            for card, proofs in receipts.items()
            if proofs.get(kind, {}).get("passed")
            and (specs["cards"][card]["engine"], form) not in equipped
        ]
        size = ceil(len(eligible) / limit)
        groups.extend({} for _ in range(max(0, size - len(groups))))
        for name in sorted(eligible, key=lambda n: (-costs[n], n)):
            choices = [g for g in groups if name not in g and list(g.values()).count(form) < limit]
            if not choices:
                groups.append({})
                choices = [groups[-1]]
            group = min(choices, key=lambda g: (len(g), sum(costs[n] for n in g)))
            group[name] = form
    decks = {}
    for i, slots in enumerate(groups, 1):
        featured = sorted(slots, key=lambda n: (-slots[n], n))
        cards = featured + [name for name in ANCHORS if name not in slots][: 8 - len(slots)]
        decks[f"practice_forms_{i:02d}"] = {
            "cards": cards,
            "forms": [slots.get(name, 0) for name in cards],
        }
    return decks


def build_pool(catalogue, specs, standard_decks, verified, forms):
    original = {name for deck in standard_decks.values() for name in deck["cards"]}
    rows = []
    for name, card in specs["cards"].items():
        if card["engine"] not in original and verified.get(name, {}).get("passed") is True:
            base = card["forms"].get("base") or card["forms"]["champion"]
            rows.append((card["engine"], base["kind"], base["elixir"], "champion" in card["forms"]))
    size = max(ceil(len(rows) / 4), sum(v[3] for v in rows))
    groups = [[] for _ in range(size)]
    # Deal expensive cards and champions first. Spread spells/buildings and total cost, and
    # keep the other four slots for inexpensive ground, air and spell support.
    for item in sorted(rows, key=lambda v: (not v[3], v[1], -v[2], v[0])):
        eligible = [g for g in groups if len(g) < 4 and (not item[3] or not any(v[3] for v in g))]
        group = min(
            eligible, key=lambda g: (len(g), sum(v[1] == item[1] for v in g), sum(v[2] for v in g))
        )
        group.append(item)
    decks = {}
    for i, group in enumerate(groups):
        lead = [v[0] for v in group]
        # Mirror enters through the native draw queue, never as the guaranteed opening card.
        lead.sort(key=lambda name: name == "Mirror")
        cards = lead + [name for name in ANCHORS if name not in lead][: 8 - len(lead)]
        decks[f"practice_{i + 1:02d}"] = cards
    blocked = sorted(
        c["engine"]
        for c in specs["cards"].values()
        if (c["forms"].get("base") or c["forms"].get("champion", {})).get("omit_from_starting_hand")
    )
    minimum = {}
    friendly = []
    for card in specs["cards"].values():
        base = card["forms"].get("base") or card["forms"]["champion"]
        minimum[card["engine"]] = int(base["level_scaling"]["relative_level"]) + 1
        area = specs["effects"].get(card["engine"], {})
        if (
            base["kind"] == "spell"
            and area.get("only_own_troops")
            and (area.get("clone") or area.get("buff_time_ms"))
        ):
            friendly.append(card["engine"])
    return {
        "minimumLevels": {k: v for k, v in sorted(minimum.items()) if v > 1},
        "friendlySpells": sorted(friendly),
        "omitFromStartingHand": blocked,
        "format": "verified-card-practice-v2",
        "tableSHA256": specs["tableSHA256"],
        "catalogueID": catalogue["id"],
        "decks": decks,
        "formDecks": form_decks(specs, standard_decks, forms),
    }


def verified_pool(catalogue, specs, rules):
    engines = {card: row["engine"] for card, row in catalogue["cards"].items()}
    return build_pool(
        catalogue,
        specs,
        rules["decks"],
        catalogue_deployments(engines)["byCard"],
        verified_forms(specs),
    )
