import { readFileSync } from 'node:fs';

import { match } from 'ts-pattern';
import { z } from 'zod';

import type { BattleSituation, FieldUnit } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import { tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import type { QwenAction } from './actions.ts';
import { bodyCard } from './candidates.ts';
import { combatBody, forecastEffect, forecastText, type CombatBody } from './combat-projection.ts';
import { observedContacts } from './effects.ts';

// 판단 계약 v3의 머리말과 카드 코드다. Python(clash_bot.qwen.decision_input)도 같은 파일을 읽는다.
const contract = z
  .strictObject({
    version: z.literal(3),
    header: z.string(),
    codes: z.record(z.string(), z.string()),
  })
  .parse(JSON.parse(readFileSync(new URL('../../../contracts/decision-v3.json', import.meta.url), 'utf8')));

export type DecisionUnit = [body: string, x: number, y: number, variant: string];
export type DecisionEffect = [
  side: 'blue' | 'red',
  card: string,
  x: number,
  y: number,
  ageSeconds: number | null,
];
export type DecisionAction = [
  letter: string,
  kind: 'card' | 'wait' | 'ability',
  card: string | null,
  cost: number,
  x: number,
  y: number,
];
export type DecisionContext = {
  hand: Array<string | null>;
  elixir: number;
  enemyElixir: { min: number; max: number };
  enemyCycle?: Array<[card: string, minimumPlays: number, maximumPlays: number]>;
  next?: string[];
  ownEvolution?: Array<[card: string, minimumPlays: number, maximumPlays: number]>;
  own: DecisionUnit[];
  enemy: DecisionUnit[];
  bodies: { own: CombatBody[]; enemy: CombatBody[] };
  effects?: DecisionEffect[];
  skill?: string;
  actions: DecisionAction[];
  // 문자열로 직렬화하지 않는 빠른 정책 입력이다. 대전 시작 뒤 초, 화면에서 읽은 타워 체력 비율.
  clock?: number;
  towers?: { own: number[]; enemy: number[] };
};

export function decisionContext(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  situation: BattleSituation,
  clock?: number,
): DecisionContext {
  const row = (unit: FieldUnit): DecisionUnit => [
    bodyCard(unit) ?? '?',
    ...tilePoint(profile, unit),
    unit.variant ?? '?',
  ];
  return {
    hand: cards,
    elixir: Math.round(elixir * 10) / 10,
    enemyElixir: situation.opponent.elixir,
    enemyCycle: Object.entries(situation.opponent.cycle.returnsAfterPlays)
      .filter(([, wait]) => wait.min > 0 || wait.max < 4)
      .map(([card, wait]) => [card, wait.min, wait.max]),
    next: situation.own.cycle?.nextDraw,
    ownEvolution: situation.own.evolutions?.map((row) => [
      row.card,
      row.normalPlaysBeforeEvolved.min,
      row.normalPlaysBeforeEvolved.max,
    ]),
    own: situation.own.units
      .toSorted((a, b) => a.y - b.y)
      .slice(0, 5)
      .map(row),
    enemy: situation.opponent.units
      .toSorted((a, b) => b.y - a.y)
      .slice(0, 8)
      .map(row),
    bodies: {
      own: situation.own.units.toSorted((a, b) => a.y - b.y).map((unit) => combatBody(profile, unit)),
      enemy: situation.opponent.units.toSorted((a, b) => b.y - a.y).map((unit) => combatBody(profile, unit)),
    },
    effects: situation.effects
      ?.slice(0, 4)
      .map((effect): DecisionEffect => [
        effect.side,
        effect.card,
        ...tilePoint(profile, effect),
        effect.onsetCertain ? Math.round(effect.visibleAgeMs / 1000) : null,
      ]),
    skill: situation.own.ability?.availability,
    actions: actions.map((action, index): DecisionAction => [
      String.fromCharCode(65 + index),
      action.kind ?? (action.card ? 'card' : 'wait'),
      action.card,
      action.cost ?? (action.card ? CARD_INFO[action.card].cost : 0),
      ...tilePoint(profile, action.target),
    ]),
    ...(clock === undefined ? {} : { clock }),
  };
}

// Mirrored demonstrations keep the demonstrator's unseen mana as a range.
export type PublicDecisionContext = Omit<DecisionContext, 'elixir'> & {
  elixir: number | { min: number; max: number };
};
export function decisionProjection(
  context: Pick<DecisionContext, 'bodies' | 'enemyCycle' | 'enemyElixir'>,
  action: DecisionAction,
) {
  return forecastEffect({
    card: action[2],
    kind: action[1],
    x: action[4],
    y: action[5],
    own: context.bodies.own,
    enemy: context.bodies.enemy,
    enemyCycle: context.enemyCycle ?? [],
    enemyMana: context.enemyElixir,
  });
}
export function serializeDecision(context: PublicDecisionContext) {
  const code = (name: string | null) => contract.codes[name ?? ''] ?? '?';
  const units = (rows: DecisionContext['own']) =>
    rows
      .map(
        ([kind, x, y, variant]) =>
          `${code(kind)}${x},${y}${match(variant)
            .with('evolution', () => 'E')
            .with('hero', () => 'H')
            .otherwise(() => '')}`,
      )
      .join(' ');
  const effects = (context.effects ?? [])
    .map(
      ([side, card, x, y, age]) =>
        `${side === 'blue' ? 'b' : 'r'}${code(card)}${x},${y}@${age === null ? '?' : age}s`,
    )
    .join(' ');
  const contacts =
    context.enemy.length > 0 &&
    context.actions.some(([, kind, card]) => kind === 'card' && observedContacts(card, [0, 0], []) !== null);
  const mana =
    typeof context.elixir === 'number'
      ? context.elixir
      : `${Math.floor(context.elixir.min * 10) / 10}-${Math.ceil(context.elixir.max * 10) / 10}?`;
  const enemyCycle =
    context.enemyCycle?.map(([card, min, max]) => `${code(card)}${min}-${max}`).join(' ') || '?';
  const skill = match(context.skill)
    .with('ready', () => '1')
    .with('unknown', () => '?')
    .otherwise(() => '0');
  return (
    contract.header +
    `mana=${mana};enemyMana=${Math.floor(context.enemyElixir.min * 10) / 10}-${Math.ceil(context.enemyElixir.max * 10) / 10};enemyCycle=${enemyCycle};ownEvolution=${context.ownEvolution?.map(([card, min, max]) => `${code(card)}${min}-${max}`).join(' ') || '?'};towers=${context.towers ? `${context.towers.own.join(',')}|${context.towers.enemy.join(',')}` : '?'};hand=${context.hand.map(code).join('')};next=${(context.next ?? []).map(code).join('')};own=${units(context.own)};enemy=${units(context.enemy)};effects=${effects};skill=${skill}\n` +
    context.actions
      .map((action) => {
        const [letter, kind, card, , x, y] = action;
        return `${letter}:${match(kind)
          .with('ability', () => 'U')
          .with('wait', () => 'W')
          .with('card', () => {
            const hits = contacts ? observedContacts(card, [x, y], context.enemy) : null;
            return `${code(card)}${x},${y}${hits === null ? '' : `h${hits}`}`;
          })
          .exhaustive()}${forecastText(decisionProjection(context, action), kind, card)}`;
      })
      .join(' ')
  );
}

// 후보 판단(controller 3)의 Qwen 입력이다. 상황을 타입으로 만든 뒤 v3 문자열로만 바꾼다.
export function decisionPrompt(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  situation: BattleSituation,
) {
  return serializeDecision(decisionContext(profile, cards, elixir, actions, situation));
}
