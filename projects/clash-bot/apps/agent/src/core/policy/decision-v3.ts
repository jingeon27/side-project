import { readFileSync } from 'node:fs';

import { match } from 'ts-pattern';
import { z } from 'zod';

import type { BattleSituation, FieldUnit } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import { tilePoint } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import type { QwenAction } from './actions.ts';
import { bodyCard } from './candidates.ts';

// 판단 계약 v3의 머리말과 카드 코드다. Python(clash_bot.qwen.decision_input)도 같은 파일을 읽는다.
const contract = z
  .strictObject({
    version: z.literal(3),
    header: z.string(),
    hints: z.strictObject({ graveyard: z.string(), ability: z.string(), goblin_hut: z.string() }),
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
  next?: string[];
  own: DecisionUnit[];
  enemy: DecisionUnit[];
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
    next: situation.own.cycle?.nextDraw,
    own: situation.own.units
      .toSorted((a, b) => a.y - b.y)
      .slice(0, 5)
      .map(row),
    enemy: situation.opponent.units
      .toSorted((a, b) => b.y - a.y)
      .slice(0, 8)
      .map(row),
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

export function serializeDecision(context: DecisionContext) {
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
  const hints = [
    ...(context.effects?.some(([side, card]) => side === 'red' && card === 'graveyard')
      ? [contract.hints.graveyard]
      : []),
    ...(context.skill === 'ready' ? [contract.hints.ability] : []),
    ...(context.hand.includes('goblin_hut') || context.own.some(([card]) => card === 'goblin_hut')
      ? [contract.hints.goblin_hut]
      : []),
  ];
  return (
    contract.header +
    (hints.length ? hints.join(' ') + '\n' : '') +
    `mana=${context.elixir};enemyMana=${Math.floor(context.enemyElixir.min * 10) / 10}-${Math.ceil(context.enemyElixir.max * 10) / 10};hand=${context.hand.map(code).join('')};next=${(context.next ?? []).map(code).join('')};own=${units(context.own)};enemy=${units(context.enemy)};effects=${effects};skill=${context.skill === 'ready' ? 1 : 0}\n` +
    context.actions
      .map(
        ([letter, kind, card, , x, y]) =>
          `${letter}:${match(kind)
            .with('ability', () => 'U')
            .with('wait', () => 'W')
            .with('card', () => `${code(card)}${x},${y}`)
            .exhaustive()}`,
      )
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
