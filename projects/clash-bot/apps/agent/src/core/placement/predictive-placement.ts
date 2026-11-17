import { uniqBy } from 'es-toolkit';

import type { CardId } from '../cards.ts';
import { COMBAT } from '../combat-reference.ts';
import { DEPLOYMENT } from '../deployment.ts';
import { distance, screenPoint, tilePoint, type Point } from '../geometry.ts';
import { CARD_MECHANICS } from '../knowledge.ts';
import type { Profile } from '../profile.ts';
import { graveyardPlacements, poisonPlacements } from './area-spell-placement.ts';
import { combatBody, forecastEffect } from './combat-projection.ts';
import { hutPlacements } from './hut-placement.ts';
import {
  graveyardThreat,
  ownPoint,
  unitPlacements,
  type PlacementField,
  type PlacementOption,
} from './placement.ts';

function projectedPlacements(profile: Profile, card: CardId, situation?: PlacementField): PlacementOption[] {
  if (!situation || !['ice_wizard', 'barbarian_barrel'].includes(card)) return [];
  const enemy = situation.opponent.units
    .filter((unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 90)
    .map((unit) => combatBody(profile, unit));
  const own = situation.own.units.map((unit) => combatBody(profile, unit));
  const targets = enemy.flatMap((unit) => {
    if (card === 'barbarian_barrel')
      return [0.2, 0.65, 1.1].map((roll) => {
        const time = COMBAT.inputDelaySeconds + COMBAT.barbarian_barrel.deploySeconds + roll;
        return {
          x: unit.x + (unit.velocity?.[0] ?? 0) * time,
          y: unit.y + (unit.velocity?.[1] ?? 0) * time - COMBAT.barbarian_barrel.speed * roll,
        };
      });
    const time = COMBAT.inputDelaySeconds + COMBAT.ice_wizard.deploySeconds;
    const x = unit.x + (unit.velocity?.[0] ?? 0) * time,
      y = unit.y + (unit.velocity?.[1] ?? 0) * time;
    return [
      { x, y },
      { x: x - 1.8, y: y - 1.2 },
      { x: x + 1.8, y: y - 1.2 },
      { x, y: y - 2.5 },
    ];
  });
  return targets
    .flatMap((point) => {
      const target = ownPoint(profile, card, screenPoint(profile, [point.x, point.y]), situation);
      if (!target) return [];
      const [x, y] = tilePoint(profile, target);
      const forecast = forecastEffect({
        card,
        kind: 'card',
        x,
        y,
        own,
        enemy,
        enemyCycle: [],
        enemyMana: { min: 0, max: 10 },
      });
      const poison = situation.effects?.some(
        (effect) =>
          effect.side === 'red' && effect.card === 'poison' && distance(target, effect) < effect.radius,
      )
        ? 4
        : 0;
      const melee =
        card === 'ice_wizard'
          ? situation.opponent.units.filter(
              (unit) =>
                ['knight', 'barbarian'].includes(unit.kind ?? unit.card ?? '') && distance(target, unit) < 35,
            ).length * 2
          : 0;
      return [
        {
          target,
          description: `${card} intercept after deployment and movement`,
          score: forecast.kills[0] * 4 + forecast.trajectoryDamage / 100 - poison - melee,
        },
      ];
    })
    .toSorted((a, b) => b.score - a.score)
    .reduce<PlacementOption[]>(
      (selected, option) =>
        selected.length < 4 && selected.every((other) => distance(option.target, other.target) > 18)
          ? [...selected, { target: option.target, description: option.description }]
          : selected,
      [],
    );
}

export function predictivePlacements(
  profile: Profile,
  card: CardId,
  threats: Point[],
  situation: PlacementField,
): PlacementOption[] {
  if (card === 'graveyard') return graveyardPlacements(profile, situation);
  if (card === 'poison') return poisonPlacements(profile, situation);
  if (card === 'goblin_hut') return hutPlacements(profile, situation);
  // Distant enemy bodies are board context, not a defensive deployment target.
  const defensiveThreats = threats.filter((point) => point.y > profile.riverY);
  const existing = unitPlacements(profile, card, defensiveThreats, situation);
  if (['knight', 'furnace', 'skeletons'].includes(card)) {
    const drill = situation.opponent.units.find(
      (unit) => unit.kind === 'goblin_drill' && unit.confidence >= 0.75 && unit.y > profile.riverY,
    );
    const drillDefense =
      drill && ['knight', 'skeletons'].includes(card)
        ? [-12, 12].flatMap((offset) => {
            const target = ownPoint(profile, card, { x: drill.x + offset, y: drill.y + 5 }, situation);
            return target
              ? [
                  {
                    target,
                    description: `${card} intercept emerged Goblin Drill and death-spawned Goblins; compare deployment phase`,
                  },
                ]
              : [];
          })
        : [];
    const firecracker = situation.opponent.units.find(
      (unit) => unit.kind === 'firecracker' && unit.confidence >= 0.85 && unit.y > profile.riverY - 55,
    );
    const centralPull =
      firecracker && ['knight', 'skeletons'].includes(card)
        ? [8, 10].flatMap((x) => {
            const target = ownPoint(profile, card, screenPoint(profile, [x, 12.5]), situation);
            return target
              ? [
                  {
                    target,
                    description:
                      'central Firecracker lure; compare shot direction, tower support and spell cleanup',
                  },
                ]
              : [];
          })
        : [];
    const urgent =
      defensiveThreats.length > 0 ||
      graveyardThreat(profile, situation) !== undefined ||
      situation.opponent.units.some((unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 55);
    if (urgent) {
      const intercepts = situation.opponent.units.flatMap((unit) => {
        if (
          unit.confidence < 0.75 ||
          unit.y < profile.riverY - 25 ||
          !unit.velocity ||
          !unit.motion ||
          unit.motion.samples < 2 ||
          unit.motion.elapsedMs < 100
        )
          return [];
        const delay = COMBAT.inputDelaySeconds + (CARD_MECHANICS[card]?.deploySeconds ?? 1);
        const target = ownPoint(
          profile,
          card,
          {
            x: unit.x + unit.velocity.xPerSecond * delay,
            y: unit.y + unit.velocity.yPerSecond * delay + 5,
          },
          situation,
        );
        return target
          ? [
              {
                target,
                description: `${card} intercept at observed position after input and deployment delay`,
              },
            ]
          : [];
      });
      const rear = existing.filter((option) => option.description.includes('behind the King Tower'));
      const defense = uniqBy(
        [
          ...drillDefense,
          ...intercepts,
          ...centralPull,
          ...existing.filter((option) => !rear.includes(option)),
        ],
        (option) => `${option.target.x}:${option.target.y}`,
      );
      return [...defense.slice(0, 5 - rear.length), ...rear];
    }
    const rearTiles =
      card === 'skeletons'
        ? ([[9, 0.5], ...DEPLOYMENT.kingBackTiles] as const)
        : [
            ...DEPLOYMENT.kingBackTiles,
            ...([
              [3.5, 3],
              [14.5, 3],
            ] as const),
          ];
    const rear = rearTiles.flatMap((tile) => {
      const target = ownPoint(profile, card, screenPoint(profile, tile), situation);
      return target ? [{ target, description: `${card} calm rear buildup; preserve defense and cycle` }] : [];
    });
    const support = existing.filter((option) => option.description.includes('behind advancing'));
    return uniqBy([...support, ...rear], (option) => `${option.target.x}:${option.target.y}`).slice(0, 5);
  }
  if (!['ice_wizard', 'barbarian_barrel'].includes(card)) return existing;
  const projected = projectedPlacements(profile, card, situation);
  const approaching = situation.opponent.units.some(
    (unit) => unit.confidence >= 0.75 && unit.y > profile.riverY - 90,
  );
  const urgent = approaching || graveyardThreat(profile, situation) !== undefined;
  const rear = DEPLOYMENT.kingBackTiles.map((point) => ({
    target: screenPoint(profile, point),
    description: 'Ice Wizard safe rear buildup',
  }));
  const legal = (option: PlacementOption) => {
    const target = ownPoint(profile, card, option.target, situation);
    return target ? [{ ...option, target }] : [];
  };
  const key = (option: PlacementOption) => `${option.target.x}:${option.target.y}`;
  if (card === 'barbarian_barrel') {
    const idle = [95, 273].map((x) => ({
      target: { x, y: profile.riverY + 25 },
      description: 'Barrel straight lane; compare holding for defense',
    }));
    return uniqBy([...projected, ...idle].flatMap(legal), key).slice(0, 5);
  }
  if (urgent) {
    const defenses = uniqBy([...projected, ...existing].flatMap(legal), key).filter(
      (option) => !rear.some((back) => distance(back.target, option.target) < 15),
    );
    return [...defenses.slice(0, 4), ...rear.slice(0, 1).flatMap(legal)];
  }
  const tanks = situation.own.units.filter(
    (unit) => ['knight', 'furnace'].includes(unit.kind ?? unit.card ?? '') && unit.y < profile.riverY + 120,
  );
  const support = tanks.map((unit) => ({
    target: { x: unit.x, y: unit.y + (unit.velocity?.yPerSecond ?? 0) * 1.5 + 35 },
    description: 'Ice Wizard follows the advancing tank after deployment',
  }));
  const buildup = [
    ...support,
    ...rear,
    ...(
      [
        [3.5, 3],
        [14.5, 3],
        [9, 0.5],
      ] as const
    ).map((tile) => ({
      target: screenPoint(profile, tile),
      description: 'Ice Wizard rear buildup with deployment time',
    })),
  ];
  return uniqBy(buildup.flatMap(legal), key).slice(0, 5);
}
