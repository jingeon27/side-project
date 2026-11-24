"""Where each kind of card may be tried, in own-frame tiles: the placement-rule tiles and the grid.

No battle engine is loaded here. src/core/fast/candidates.ts builds the same tiles in the same
order for the live screen, and test-fixtures/fast-candidate-cases.json holds both to it.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from clash_bot.paths import CONTRACTS_DIR


class DeploymentSpec(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    format: Literal["clash-deployment-v1"]
    kingTowerTile: tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]]
    kingBackTiles: tuple[
        tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]],
        tuple[Annotated[float, Field(ge=0, le=18)], Annotated[float, Field(ge=0, le=16)]],
    ]


DEPLOYMENT = DeploymentSpec.model_validate_json((CONTRACTS_DIR / "deployment.json").read_text())
LANES = [(3.5, 10), (14.5, 10), (3.5, 14), (14.5, 14), *DEPLOYMENT.kingBackTiles]
ENEMY_TOWERS = [(3.5, 25.5), (14.5, 25.5)]


def placement_tiles(placement, threat, targets):
    """Up to six own-frame tiles per card; src/core/fast/candidates.ts has the same rules."""
    match placement:
        case "spawn_spell":  # Graveyard: centre / outer / forward in both lanes
            points = [
                (x + dx, y)
                for x in (3.5, 14.5)
                for dx, y in ((0, 25.5), (-1 if x < 9 else 1, 25.5), (0, 24.5))
            ]
        case "area_spell":
            points = ([threat] if threat else []) + targets[:3] + ENEMY_TOWERS
        case "building":
            points = [(9, 9), (7, 12), (11, 12), (3.5, 10), (14.5, 10), (9, 6)]
        case "troop" | "ranged_troop" | "rolling_spell":
            points = list(LANES)
            if threat:
                x, y = threat
                gap = 3 if placement == "ranged_troop" else 1
                points[:2] = [
                    (max(0.6, min(17.4, x)), max(1, min(15, y - gap))),
                    (9, max(2, min(13, y - 1))),
                ]
        case "tower_spell":
            points = [*ENEMY_TOWERS, (3.5, 23.5), (14.5, 23.5)]
        case "anywhere":
            points = ([threat] if threat else []) + [
                (3.5, 22.5),
                (14.5, 22.5),
                (3.5, 28.5),
                (14.5, 28.5),
            ]
        case _:
            points = []
    return points[:6]


# Every own-side tile for a deployed card, and every second tile of the field for a spell, on
# top of the placement rule's tiles. The policy ranks them all; search takes its best few.
OWN_GRID = [(x + 0.5, y + 0.5) for y in range(15) for x in range(18)]


def pocket_tiles(fallen):
    return [(x, y) for i, x in enumerate((7.5, 10.5)) if i in fallen for y in (18.5, 19.5)]


FIELD_GRID = [(x, y) for y in range(1, 32, 2) for x in range(1, 18, 2)]


def placement_grid(placement, targets):
    """src/core/fast/candidates.ts builds the same grid in the same order."""
    match placement:
        case "troop" | "ranged_troop" | "building" | "rolling_spell":
            return OWN_GRID
        case "area_spell" | "spawn_spell" | "tower_spell" | "anywhere":
            return [*targets, *FIELD_GRID]
        case _:
            return []
