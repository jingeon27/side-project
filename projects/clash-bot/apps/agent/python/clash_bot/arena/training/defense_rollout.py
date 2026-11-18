"""Compare immediate defenses from the same publicly reconstructed board."""

from collections import defaultdict
from dataclasses import dataclass
from itertools import permutations

from ..sim.rules import CARD_ID, TILE, Action

HORIZON_TICKS = 160
MIN_HP_SAVED = 50
WAIT = Action(-1)
COUNTERS = {
    "drill": ("BarbLog", "Knight", "Skeletons"),
    "graveyard": ("Poison", "IceWizard", "BarbLog", "Skeletons"),
}


def observed_attack(context):
    if any(
        side == "red" and card == "graveyard" and y < 16
        for side, card, _x, y, _age in context.get("effects", [])
    ):
        return "graveyard"
    if any(
        body["kind"] == "goblin_drill" and body["y"] < 16 for body in context["bodies"]["enemy"]
    ):
        return "drill"
    return None


def focus_families(context, attack):
    """Keep the extra PUCT placements for the most relevant defense cards."""
    if attack == "graveyard":
        return tuple(CARD_ID[name] for name in COUNTERS[attack][:3])
    if any(body["y"] < 18 for body in context["bodies"]["enemy"]):
        return (CARD_ID["BarbLog"],)
    return ()


def placements(actions, prior, attack):
    """Test close alternatives even when the main tree enforces tile separation."""
    families = defaultdict(list)
    allowed = {-1, *(CARD_ID[name] for name in COUNTERS[attack])}
    for index in sorted(range(len(actions)), key=lambda i: -prior[i]):
        if actions[index].card in allowed:
            families[actions[index].card].append(index)
    selected = [indices[0] for indices in families.values()]
    for card, indices in families.items():
        anchor = actions[indices[0]]
        nearby = [
            i
            for i in indices[1:]
            if (actions[i].x - anchor.x) ** 2 + (actions[i].y - anchor.y) ** 2 <= (1.5 * TILE) ** 2
        ]
        selected.extend(nearby[: 8 if attack == "drill" and card == CARD_ID["BarbLog"] else 1])
    return selected


@dataclass(frozen=True)
class Outcome:
    own_hp: int
    enemy_hp: int
    enemy_king_active: bool
    retained: int
    cost: int


def rollout(scratch, source, snapshot, team, action):
    scratch.adopt(snapshot, source)
    before = scratch.state()
    if before["game_over"]:
        return None
    start = len(scratch.history)
    moves = [WAIT, WAIT]
    moves[team] = action
    receipts = scratch.play(moves, HORIZON_TICKS)
    after = scratch.state()
    if after["game_over"] or after["tick"] != before["tick"] + HORIZON_TICKS:
        return None
    cost = 0
    if action != WAIT:
        if len(receipts) != 1 or receipts[0][1] != 0:
            return None
        matches = [
            play["cost"]
            for event in scratch.history[start:]
            for play in event["plays"]
            if play["team"] == team and play["action"] == action.row()
        ]
        if len(matches) != 1:
            return None
        cost = matches[0]
    own, enemy = after["players"][team], after["players"][1 - team]
    return Outcome(
        sum(own["tower_hp"]),
        sum(enemy["tower_hp"]),
        bool(enemy["king_active"]),
        own["elixir_milli"],
        cost,
    )


def comparisons(scratch, worlds, snapshots, team, actions, prior, attack):
    """Only keep improvements that save tower HP in every matched world without extra cost."""
    outcomes = {}
    anchors = {}
    for index in placements(actions, prior, attack):
        anchors.setdefault(actions[index].card, index)
        results = [
            rollout(scratch, source, snapshot, team, actions[index])
            for source, snapshot in zip(worlds, snapshots, strict=True)
        ]
        if all(result is not None for result in results):
            outcomes[index] = results

    def evidence(preferred, other):
        gains = []
        for left, right in zip(outcomes[preferred], outcomes[other]):
            if (
                left.own_hp - right.own_hp < MIN_HP_SAVED
                or left.cost > right.cost
                or left.retained < right.retained
                or left.enemy_hp > right.enemy_hp
                or left.enemy_king_active > right.enemy_king_active
            ):
                return None
            gains.append(left.own_hp - right.own_hp)
        return {
            "preferred": preferred,
            "other": other,
            "savedHP": gains,
            "preferredAction": actions[preferred].row(),
            "otherAction": actions[other].row(),
        }

    def best_pair(indices, same):
        eligible = (
            evidence(left, right)
            for left, right in permutations(indices, 2)
            if (actions[left].card == actions[right].card) == same
        )
        return max(
            (pair for pair in eligible if pair is not None),
            key=lambda pair: (
                same and pair["other"] == anchors[actions[pair["other"]].card],
                min(pair["savedHP"]),
            ),
            default=None,
        )

    # Compare another card with the safest position actually tested for that family.
    representatives = {}
    for index in sorted(
        outcomes,
        key=lambda i: (
            min(row.own_hp for row in outcomes[i]),
            sum(row.own_hp for row in outcomes[i]),
        ),
        reverse=True,
    ):
        representatives.setdefault(actions[index].card, index)
    return {
        "attack": attack,
        "ticks": HORIZON_TICKS,
        "worlds": len(worlds),
        "compared": len(outcomes),
        "pairs": [
            pair
            for pair in (best_pair(outcomes, True), best_pair(representatives.values(), False))
            if pair is not None
        ],
    }
