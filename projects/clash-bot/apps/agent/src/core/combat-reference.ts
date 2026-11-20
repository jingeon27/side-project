import { readFileSync } from 'node:fs';

import { z } from 'zod';

// Level 11 reference potential, not measured live-screen damage or future hits.
export const PLACEMENT_EFFECTS = z
  .strictObject({
    format: z.literal('level11-placement-reference-v2'),
    ice_wizard: z.strictObject({ damage: z.number().positive(), radius: z.number().positive() }),
    barbarian_barrel: z.strictObject({
      damage: z.number().positive(),
      length: z.number().positive(),
      width: z.number().positive(),
      depth: z.number().positive(),
    }),
    poison: z.strictObject({
      dps: z.number().positive(),
      duration: z.number().positive(),
      radius: z.number().positive(),
    }),
    knownGroundBodies: z.array(z.string()),
  })
  .parse(
    JSON.parse(readFileSync(new URL('../../contracts/placement-effects.json', import.meta.url), 'utf8')),
  );

const bodySchema = z.object({
  hp: z.number().positive(),
  speed: z.number().nonnegative(),
  ground: z.boolean(),
});
const parameters = z
  .object({
    format: z.literal('observed-motion-damage-v1'),
    referenceLevel: z.number(),
    counterpushCalibrated: z.boolean(),
    inputDelaySeconds: z.number(),
    inputDelayUncertainty: z.number(),
    positionUncertaintyTiles: z.number(),
    turnUncertaintyTilesPerSecond: z.number(),
    stepSeconds: z.number(),
    ice_wizard: z.object({ deploySeconds: z.number() }),
    barbarian_barrel: z.object({
      deploySeconds: z.number(),
      speed: z.number(),
    }),
    poison: z.object({
      deploySeconds: z.number(),
      tickSeconds: z.number(),
      slowMultiplier: z.number(),
      trajectoryHorizonSeconds: z.number().positive(),
    }),
    ability: z.object({
      markRange: z.number(),
      freezeSeconds: z.number(),
      damage: z.number(),
      radius: z.number(),
    }),
    bodies: z.record(z.string(), bodySchema),
    policy: z.object({
      noObservedSkillOpportunity: z.number(),
      emptyRoll: z.number(),
      reservedRoll: z.number(),
      emptyPoison: z.number(),
      thinPoison: z.number(),
      kingDamage: z.number(),
      kingFootprintRadius: z.number(),
      graveyardSpawnRadius: z.number(),
      unsupportedGraveyard: z.number(),
      graveyardCounters: z.record(z.string(), z.number().positive()),
      defenseReserve: z.number(),
      earlyHut: z.number(),
      redundantHut: z.number(),
      redundantPoison: z.number(),
      uncertainCounterWeight: z.number().min(0).max(1),
      unknownCounterWeight: z.number().min(0).max(1),
      lowReserveBuildup: z.number(),
      buildupMana: z.record(z.string(), z.number()),
      evolutionCyclePreference: z.number(),
      possibleElixirDeficit: z.number(),
      confirmedElixirDeficit: z.number(),
      unansweredGraveyard: z.number(),
      unansweredDrill: z.number(),
      preEmergenceSkeletons: z.number(),
      drillKnightDefense: z.number(),
      graveyardPoisonFollowup: z.number(),
    }),
  })
  .parse(
    JSON.parse(readFileSync(new URL('../../contracts/combat-projection.json', import.meta.url), 'utf8')),
  );

export const COMBAT = {
  ...parameters,
  ice_wizard: { ...PLACEMENT_EFFECTS.ice_wizard, ...parameters.ice_wizard },
  barbarian_barrel: { ...PLACEMENT_EFFECTS.barbarian_barrel, ...parameters.barbarian_barrel },
  poison: { ...PLACEMENT_EFFECTS.poison, ...parameters.poison },
};
export const referenceBodyHp = (kind: string) => bodySchema.parse(COMBAT.bodies[kind]).hp;
export const referenceBodySpeed = (kind: string) => bodySchema.parse(COMBAT.bodies[kind]).speed;
