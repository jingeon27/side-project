"""Public, rendered BEFORE positions and soft search targets for Qwen study."""

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from clash_bot.files import atomic_json

from .rules import FIELDS, TILE, Action, canonical, digest, new_battle
from .selfplay import live_mirror
from .storage import seed_for

NAMES = [
    "Barbarian Barrel",
    "Evo Furnace",
    "Goblin Hut",
    "Graveyard",
    "Hero Ice Wizard",
    "Evo Knight",
    "Poison",
    "Skeletons",
]


def render(observation, path):
    team, state = observation["team"], observation["state"]
    image = Image.new("RGB", (450, 700), "#192b25")
    draw = ImageDraw.Draw(image)
    point = lambda x, y: (round(27 + x * 22), round(670 - y * 20))
    draw.rectangle([point(0, 32), point(18, 0)], fill="#568467", outline="#b5c6af")
    draw.line([point(0, 16), point(18, 16)], fill="#66bcd6", width=14)
    for x in (3.5, 14.5):
        draw.line([point(x, 15), point(x, 17)], fill="#d0bd8f", width=27)
    types = json.loads(new_battle().unit_types_json())
    for row in state["spells"]:
        if row[1] not in (3, 6):
            continue
        x, y = canonical(row[3] / TILE, row[4] / TILE, team)
        px, py = point(x, y)
        draw.ellipse(
            (px - 66, py - 60, px + 66, py + 60),
            outline="#cc70e0" if row[1] == 3 else "#78cc65",
            width=2,
        )
    for row in state["entities"]:
        x, y = canonical(row[FIELDS["x"]] / TILE, row[FIELDS["y"]] / TILE, team)
        px, py = point(x, y)
        tower = row[FIELDS["card_id"]] < 0
        radius = 12 if tower else 5
        color = "#8bc8ff" if row[FIELDS["team"]] == team else "#ff9a99"
        draw.ellipse(
            (px - radius, py - radius, px + radius, py + radius), fill=color, outline="white"
        )
        name = "Tower" if tower else types[row[FIELDS["unit_type"]]]
        draw.text(
            (max(1, min(330, px - 14)), py - 20), f"{name[:17]} {row[FIELDS['hp']]}", fill="white"
        )
    draw.text(
        (8, 5), f"Public simulation position, t={state['tick'] / 20:g}s; blue=own", fill="white"
    )
    image.save(path)


def prompt_for(row):
    obs = row["observation"]
    state, team = obs["state"], obs["team"]
    own, other = state["players"][team], state["players"][1 - team]
    actions = [Action(*action) for action in row["actions"]]
    choices = []
    for index, action in enumerate(actions):
        x, y = canonical(action.x / TILE, action.y / TILE, team)
        label = (
            "WAIT"
            if action.card == -1
            else "Hero Ice Wizard ability, 2 elixir, no card draw"
            if action.card == -2
            else f"{NAMES[action.card]} at ({x:.2f},{y:.2f})"
        )
        choices.append(f"{chr(65 + index)}: {label}")
    return (
        "Choose a legal Clash Royale move. Return one letter only. This image is a PUBLIC local simulation BEFORE any proposed move. "
        "Own side is blue at the bottom; coordinates are tiles, x=0..18, own y=0..16. Enemy hand and future RNG are unknown. "
        "Win by crowns, then the native overtime/tiebreak rules. Both sides regenerate equal elixir; overflow at 10 is lost. "
        "8 cards, hand 4, played card goes to FIFO queue behind 4 draws. Ability costs 2 and does not draw or advance evolution. "
        "Furnace moves and spawns fire spirits; Hut spawns spear goblins. Children spend no elixir. Graveyard has a fixed spawn sequence. "
        f"Clock={state['tick'] / 20:g}s, multiplier={state['elixir_rate']}, own elixir={own['elixir_milli'] / 1000:.2f}, "
        f"enemy public estimate={other['elixir_range']}. Own hand={[NAMES[c] for c in own['hand']]}, "
        f"next={NAMES[own['next_card']]}, own evolutions={own['evo']}, own ability={own['abilities']}. "
        f"Own tower HP={own['tower_hp']}, enemy tower HP={other['tower_hp']}.\n"
        + "\n".join(choices)
        + "\nMove:"
    )


def export(data_dir, episodes, count=8):
    eligible = [
        row
        for episode in episodes
        if episode["completed"] and not episode["rejectedCommands"] and live_mirror(episode)
        for row in episode["samples"]
        if row["search"]["simulations"] >= 8 and row["outcome"] in (-1, 0, 1)
    ]
    if not eligible:
        return None
    # Stratify by searched card, then sample within card. Rare candidates stay
    # visible without inventing labels for cards absent from collected games.
    groups = {}
    for row in eligible:
        card = row["actions"][int(np.argmax(row["target"]))][0]
        groups.setdefault(card, []).append(row)
    identity = digest(
        {"episodes": sorted({row["gameID"] for row in eligible}), "count": count, "format": 1}
    )
    rng = np.random.default_rng(seed_for("qwen_export", identity))
    for group in groups.values():
        rng.shuffle(group)
    selected = []
    while len(selected) < count and any(groups.values()):
        for key in sorted(groups):
            if groups[key] and len(selected) < count:
                selected.append(groups[key].pop())
    root = Path(data_dir) / "arena/exports" / identity
    destination = root / "dataset.json"
    if destination.exists():
        return str(destination)
    root.mkdir(parents=True, exist_ok=True)
    rows = []
    for index, row in enumerate(selected):
        name = f"{index:03d}.png"
        render(row["observation"], root / name)
        rows.append(
            {
                "id": f"{row['gameID']}-s{row['team']}-t{row['observation']['state']['tick']}",
                "image": name,
                "imageSHA256": hashlib.sha256((root / name).read_bytes()).hexdigest(),
                "prompt": prompt_for(row),
                "choices": list(range(len(row["actions"]))),
                "target": row["target"],
                "rulesID": row["rulesID"],
                "terminalOutcome": row["outcome"],
                "search": row["search"],
                "sourceGameID": row["gameID"],
                "positionTime": row["observation"]["state"]["tick"],
            }
        )
    body = {
        "format": "clash-arena-qwen-search-v1",
        "rulesID": selected[0]["rulesID"],
        "samples": rows,
        "source": "local_native_selfplay_public_before_state",
        "teacherQualifiedForRealGame": False,
        "deploymentRequires": "separate frozen Counterpush baseline/challenger evaluation",
    }
    atomic_json(destination, body)
    return str(destination)
