"""Current-rules replay sampling with room for rarely seen cards and matched defenses."""

from collections import Counter, defaultdict

import numpy as np

from ..sim.rules import CARDS


def labeled_cards(row):
    return {
        action[0]
        for action, mass in zip(row["actions"], row["targetWithoutTowers"], strict=True)
        if action[0] != -1 and mass > 0
    }


def replay_coverage(samples):
    cards, goals, decks = Counter(), Counter(), Counter()
    defense_rows = defense_pairs = attack_pairs = 0
    for row in samples:
        cards.update(labeled_cards(row))
        if "practiceGoal" in row:
            goals[row["practiceGoal"]] += 1
        if "learnerDeck" in row:
            decks[row["learnerDeck"]] += 1
        defense_rows += bool(row["defensePairs"])
        defense_pairs += len(row["defensePairs"])
        attack_pairs += len(row["attackPairs"])
    return {
        "cardsWithTarget": {card: cards[index] for index, card in enumerate(CARDS)},
        "abilityWithTarget": cards[-2],
        "practiceGoals": dict(goals),
        "directDeckRows": dict(decks),
        "missingCards": [card for index, card in enumerate(CARDS) if not cards[index]],
        "defenseRows": defense_rows,
        "defensePairs": defense_pairs,
        "attackPairs": attack_pairs,
    }


def replay_samples(episodes, rules_id, max_samples=4096, seed=0):
    valid = [
        row
        for episode in episodes
        if episode["completed"] and episode["rulesID"] == rules_id
        for row in episode["samples"]
        if row["outcome"] in (-1, 0, 1)
    ]
    if len(valid) <= max_samples:
        return valid
    support, goals = defaultdict(list), defaultdict(list)
    defenses, attacks = [], []
    for index, row in enumerate(valid):
        if "practiceGoal" in row:
            goals[row["practiceGoal"]].append(index)
        for card in sorted(labeled_cards(row)):
            support[card].append(index)
        if row["defensePairs"]:
            defenses.append(index)
        if row["attackPairs"]:
            attacks.append(index)

    rng = np.random.default_rng(seed)
    chosen = set()

    def reserve(indices, count):
        remaining = [index for index in indices if index not in chosen]
        count = min(count, len(remaining), max_samples - len(chosen))
        if count:
            chosen.update(rng.choice(remaining, count, replace=False).tolist())

    for goal in sorted(goals, key=lambda key: (len(goals[key]), key)):
        reserve(goals[goal], 1)
    per_card = min(8, max(1, max_samples // max(1, len(support))))
    for card in sorted(support, key=lambda card: (len(support[card]), card)):
        indices = support[card]
        needed = max(0, per_card - sum(index in chosen for index in indices))
        reserve(indices, needed)
    reserve(defenses, max(0, max_samples // 8 - sum(index in chosen for index in defenses)))
    reserve(attacks, max(0, max_samples // 8 - sum(index in chosen for index in attacks)))
    reserve(range(len(valid)), max_samples - len(chosen))
    return [valid[index] for index in sorted(chosen)]
