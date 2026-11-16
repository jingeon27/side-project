import { readFileSync } from 'node:fs';

import type { QwenAction } from '../../android/policy/qwen-actions.ts';
import type { CardId, Profile } from '../../shared/config.ts';
import type { BattleSituation } from '../domain/battle-state.ts';
import { compactPrompt } from './decision-v2.ts';

const contract = JSON.parse(
  readFileSync(new URL('../../../contracts/decision-v3.json', import.meta.url), 'utf8'),
) as {
  header: string;
  codes: Record<string, string>;
};
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
export function fastPrompt(
  profile: Profile,
  cards: Array<CardId | null>,
  elixir: number,
  actions: QwenAction[],
  situation: BattleSituation,
) {
  const expanded = compactPrompt(profile, cards, elixir, actions, situation);
  return serializeDecision(JSON.parse(expanded.slice(expanded.indexOf('\n') + 1)) as DecisionContext);
}
