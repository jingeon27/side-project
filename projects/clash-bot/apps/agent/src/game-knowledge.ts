import { type CardId } from './config.ts';

// Level-11 reference values checked 2026-11-15. Counterpush's physics have not
// been calibrated against all of them. Engine speed units are NOT tiles/sec.
export const KNOWLEDGE_VERSION = 'cr-level11-2026-11-14';
export const KNOWLEDGE_SOURCES = {
  currentStats: 'https://www.royaletools.com/cards/',
  furnaceRangeAndGraveyardCount:
    'https://supercell.com/en/games/clashroyale/blog/release-notes/june-balance-changes-2026/',
  fixedGraveyard: 'https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes-26/',
  revisedGraveyard: 'https://supercell.com/en/games/clashroyale/blog/news/february-balance-changes-26/',
  furnaceRework: 'https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-fired-up/',
  hutSpawn: 'https://supercell.com/en/games/clashroyale/blog/release-notes/april26-balance-changes/',
  singleUseAbilities:
    'https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/',
};

export const UNIT_MECHANICS = {
  knight: {
    hp: 1766,
    damage: 202,
    rangeTiles: 1.2,
    hitSeconds: 1.2,
    firstHitSeconds: 0.5,
    speed: 60,
    movement: 'medium',
    targets: 'ground',
    splashTiles: 0,
  },
  furnace: {
    hp: 727,
    damage: 179,
    rangeTiles: 5.5,
    hitSeconds: 1.7,
    firstHitSeconds: 0.5,
    speed: 60,
    movement: 'medium',
    targets: 'air_and_ground',
    splashTiles: 0,
  },
  ice_wizard: {
    hp: 688,
    damage: 89,
    spawnDamage: 84,
    spawnRadiusTiles: 3,
    rangeTiles: 5.5,
    hitSeconds: 1.7,
    firstHitSeconds: 0.5,
    speed: 60,
    movement: 'medium',
    targets: 'air_and_ground',
    splashTiles: 1.5,
    slowPercent: 30,
    slowSeconds: 2.5,
  },
  skeleton: {
    hp: 81,
    damage: 81,
    rangeTiles: 0.5,
    hitSeconds: 1.1,
    firstHitSeconds: 0.5,
    speed: 90,
    movement: 'fast',
    targets: 'ground',
    splashTiles: 0,
  },
  barbarian: {
    hp: 716,
    damage: 192,
    rangeTiles: 0.7,
    hitSeconds: 1.4,
    firstHitSeconds: 0.4,
    speed: 60,
    movement: 'medium',
    targets: 'ground',
    splashTiles: 0,
  },
  fire_spirit: {
    hp: 215,
    damage: 215,
    rangeTiles: 2.5,
    hitSeconds: null,
    firstHitSeconds: 0.2,
    speed: 120,
    movement: 'very_fast',
    targets: 'air_and_ground',
    splashTiles: 2.3,
    selfDestructsOnHit: true,
  },
  spear_goblin: {
    hp: 133,
    damage: 81,
    rangeTiles: 5,
    hitSeconds: 1.6,
    firstHitSeconds: 0.5,
    speed: 120,
    movement: 'very_fast',
    targets: 'air_and_ground',
    splashTiles: 0,
  },
} as const;
export const UNIT_KINDS = [
  'knight',
  'furnace',
  'ice_wizard',
  'skeleton',
  'barbarian',
  'fire_spirit',
  'spear_goblin',
  'goblin_hut',
  'barrel',
] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

type CardMechanic = {
  structure?: { hp: number; triggerRangeTiles: number; lifetimeSeconds: number };
  body?: keyof typeof UNIT_MECHANICS;
  deploySeconds?: number;
  spawn?: {
    unit: UnitKind;
    intervalSeconds: number | null;
    count?: number;
    onDeath?: number;
    lifetimeSeconds?: number;
    triggerRangeTiles?: number;
    condition?: string;
  };
  spell?: {
    radiusTiles?: number;
    durationSeconds?: number;
    dps?: number;
    damage?: number;
    slowPercent?: number;
    rollTiles?: number;
    widthTiles?: number;
    pattern?: string;
    exactSpawnOffsets?: null;
  };
  evolution?: Record<string, unknown>;
  hero?: Record<string, unknown>;
};

export const CARD_MECHANICS: Partial<Record<CardId, CardMechanic>> = {
  knight: {
    body: 'knight',
    deploySeconds: 1,
    evolution: {
      cycles: 2,
      damageReductionPercent: 60,
      condition: 'not_attacking; active variant must be observed',
    },
  },
  furnace: {
    body: 'furnace',
    deploySeconds: 1,
    spawn: { unit: 'fire_spirit', intervalSeconds: 5 },
    evolution: {
      cycles: 2,
      hotSpawnSeconds: 2.4,
      condition: 'hot and attacking; do not assume an unknown variant is evolved',
    },
  },
  ice_wizard: {
    body: 'ice_wizard',
    deploySeconds: 1,
    hero: {
      abilityCost: 2,
      singleUse: true,
      snowmanHp: 266,
      freezeSeconds: 5,
      radiusTiles: 2.5,
      condition:
        'freezes slowed enemies; destroying the snowman releases them; availability must be observed',
    },
  },
  skeletons: {
    body: 'skeleton',
    deploySeconds: 1,
    spawn: { unit: 'skeleton', intervalSeconds: null, count: 3 },
    evolution: {
      cycles: 2,
      copiesPerHit: 1,
      maxCount: 8,
      condition: 'only for an observed evolution, not normal Graveyard skeletons',
    },
  },
  barbarian_barrel: {
    body: 'barbarian',
    spell: { damage: 215, rollTiles: 4.5, widthTiles: 2.6 },
    spawn: { unit: 'barbarian', intervalSeconds: null, count: 1, condition: 'after the ground-only roll' },
  },
  goblin_hut: {
    structure: { hp: 1180, triggerRangeTiles: 6, lifetimeSeconds: 30 },
    deploySeconds: 1,
    spawn: {
      unit: 'spear_goblin',
      intervalSeconds: 2.2,
      lifetimeSeconds: 30,
      triggerRangeTiles: 6,
      onDeath: 1,
      condition: 'spawner activation and existing targets matter; not a damage-dealing cannon',
    },
  },
  graveyard: {
    spell: {
      radiusTiles: 4,
      durationSeconds: 9,
      pattern: 'fixed order; orientation and exact offsets must be measured in Counterpush',
      exactSpawnOffsets: null,
    },
    spawn: {
      unit: 'skeleton',
      intervalSeconds: null,
      count: 12,
      condition: 'spell-generated units are not a new one-elixir Skeletons card',
    },
  },
  poison: { spell: { radiusTiles: 3.5, durationSeconds: 8, dps: 92, slowPercent: 15 } },
};

export const mechanicSummary = (card: CardId) => {
  const mechanic = CARD_MECHANICS[card];
  const child = mechanic?.spawn?.unit;
  return mechanic
    ? {
        ...mechanic,
        unit: mechanic.body ? UNIT_MECHANICS[mechanic.body] : undefined,
        spawnedUnit:
          child && child !== mechanic.body && child in UNIT_MECHANICS
            ? UNIT_MECHANICS[child as keyof typeof UNIT_MECHANICS]
            : undefined,
      }
    : null;
};
