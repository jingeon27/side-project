import type { CardId } from './cards.ts';
import { COMBAT, PLACEMENT_EFFECTS, referenceBodyHp } from './combat-reference.ts';

// Level-11 reference values checked 2026-11-15. Counterpush's physics have not
// been calibrated against all of them. Engine speed units are NOT tiles/sec.
export const KNOWLEDGE_VERSION = 'cr-level11-2026-11-14';
export const UNIT_MECHANICS = {
  knight: {
    hp: referenceBodyHp('knight'),
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
    hp: referenceBodyHp('furnace'),
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
    hp: referenceBodyHp('ice_wizard'),
    damage: 89,
    spawnDamage: PLACEMENT_EFFECTS.ice_wizard.damage,
    spawnRadiusTiles: PLACEMENT_EFFECTS.ice_wizard.radius,
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
    hp: referenceBodyHp('skeleton'),
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
    hp: referenceBodyHp('barbarian'),
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
    hp: referenceBodyHp('fire_spirit'),
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
    hp: referenceBodyHp('spear_goblin'),
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
      freezeSeconds: COMBAT.ability.freezeSeconds,
      radiusTiles: COMBAT.ability.radius,
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
    spell: {
      damage: PLACEMENT_EFFECTS.barbarian_barrel.damage,
      rollTiles: PLACEMENT_EFFECTS.barbarian_barrel.length,
      widthTiles: PLACEMENT_EFFECTS.barbarian_barrel.width,
    },
    spawn: { unit: 'barbarian', intervalSeconds: null, count: 1, condition: 'after the ground-only roll' },
  },
  goblin_hut: {
    structure: { hp: referenceBodyHp('goblin_hut'), triggerRangeTiles: 6, lifetimeSeconds: 30 },
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
  poison: {
    spell: {
      radiusTiles: PLACEMENT_EFFECTS.poison.radius,
      durationSeconds: PLACEMENT_EFFECTS.poison.duration,
      dps: PLACEMENT_EFFECTS.poison.dps,
      slowPercent: 15,
    },
  },
};

// The complete registry remains versioned above. Send each body/child's numeric
// row only once, rather than repeating long stat keys inside every card entry.
export function compactMechanics(cards: CardId[]) {
  const bodies = [
    ...new Set(
      cards.flatMap((card) => {
        const info = CARD_MECHANICS[card];
        return [info?.body, info?.spawn?.unit].filter(
          (kind): kind is keyof typeof UNIT_MECHANICS => !!kind && kind in UNIT_MECHANICS,
        );
      }),
    ),
  ];
  return {
    unitColumns: [
      'kind',
      'hp',
      'damage',
      'rangeTiles',
      'hitS',
      'firstHitS',
      'movement',
      'splashTiles',
      'targets',
    ],
    units: bodies.map((kind) => {
      const unit = UNIT_MECHANICS[kind];
      return [
        kind,
        unit.hp,
        unit.damage,
        unit.rangeTiles,
        unit.hitSeconds,
        unit.firstHitSeconds,
        unit.movement,
        unit.splashTiles,
        unit.targets,
      ];
    }),
    iceWizardExtra: bodies.includes('ice_wizard')
      ? { deployDamage: 84, deployRadius: 3, slowPercent: 30, slowS: 2.5 }
      : undefined,
    fireSpiritExtra: bodies.includes('fire_spirit') ? { selfDestructsOnHit: true } : undefined,
    cards: cards.map((card) => ({ card, ...CARD_MECHANICS[card] })),
  };
}
