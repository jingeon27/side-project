import { readFileSync } from 'node:fs';

import { z } from 'zod';

import type { BattleSituation, FieldUnit } from '../battle/battle-state.ts';
import { CARD_INFO, type CardId } from '../cards.ts';
import type { Point } from '../geometry.ts';
import type { Profile } from '../profile.ts';
import type { QwenAction } from './actions.ts';
import { bodyCard } from './candidates.ts';

// 판단 계약 v3의 머리말과 카드 코드다. Python(clash_bot.qwen.decision_input)도 같은 파일을 읽는다.
const contract = z
  .strictObject({ version: z.literal(3), header: z.string(), codes: z.record(z.string(), z.string()) })
  .parse(JSON.parse(readFileSync(new URL('../../../contracts/decision-v3.json', import.meta.url), 'utf8')));

export type DecisionContext = {
  hand: Array<string | null>;
  elixir: number;
  enemyElixir: { min: number; max: number };
  next?: string[];
  own: Array<[string, number, number, string]>;
  enemy: Array<[string, number, number, string]>;
  effects?: Array<[string, string, number, number, number | null]>;
  skill?: string;
  actions: Array<[string, string, string | null, number, number, number]>;
};

// 화면 좌표를 시뮬레이터와 같은 타일 좌표(가로 0~18, 강 16)로 바꾼다.
export const tilePoint = (profile: Profile, point: Point): [number, number] => [
  Math.round((9 + ((point.x - 184) * 11) / 178) * 10) / 10,
  Math.round((16 - ((point.y - profile.riverY) * 9.5) / 130) * 10) / 10,
];

function decisionContext(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  situation: BattleSituation,
): DecisionContext {
  const row = (unit: FieldUnit): [string, number, number, string] => [
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
      .map((effect): [string, string, number, number, number | null] => [
        effect.side,
        effect.card,
        ...tilePoint(profile, effect),
        Math.round(effect.visibleAgeMs / 1000),
      ]),
    skill: situation.own.ability?.availability,
    actions: actions.map((action, index): [string, string, string | null, number, number, number] => [
      String.fromCharCode(65 + index),
      action.kind ?? (action.card ? 'card' : 'wait'),
      action.card,
      action.cost ?? (action.card ? CARD_INFO[action.card].cost : 0),
      ...tilePoint(profile, action.target),
    ]),
  };
}

export function serializeDecision(context: DecisionContext) {
  const code = (name: string | null) => contract.codes[name ?? ''] ?? '?';
  const units = (rows: DecisionContext['own']) =>
    rows
      .map(
        ([kind, x, y, variant]) =>
          `${code(kind)}${x},${y}${variant === 'evolution' ? 'E' : variant === 'hero' ? 'H' : ''}`,
      )
      .join(' ');
  const effects = (context.effects ?? [])
    .map(([side, card, x, y]) => `${side === 'blue' ? 'b' : 'r'}${code(card)}${x},${y}`)
    .join(' ');
  return (
    contract.header +
    `mana=${context.elixir};enemyMana=${Math.floor(context.enemyElixir.min * 10) / 10}-${Math.ceil(context.enemyElixir.max * 10) / 10};hand=${context.hand.map(code).join('')};next=${(context.next ?? []).map(code).join('')};own=${units(context.own)};enemy=${units(context.enemy)};effects=${effects};skill=${context.skill === 'ready' ? 1 : 0}\n` +
    context.actions
      .map(
        ([letter, kind, card, , x, y]) =>
          `${letter}:${kind === 'ability' ? 'U' : kind === 'wait' ? 'W' : `${code(card)}${x},${y}`}`,
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
