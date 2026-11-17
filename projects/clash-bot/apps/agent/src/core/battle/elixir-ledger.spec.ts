import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { CARD_INFO, type CardId } from '../cards.ts';
import { ElixirLedger } from './elixir-ledger.ts';

// 이 장부가 쓴 사례다. 시뮬레이터의 화면 모델(clash_bot.arena.policy.screen)이 같은 파일로 같은 상한을 내는지 검사한다.
const shared = JSON.parse(
  await readFile(new URL('../../../test-fixtures/opponent-elixir-cases.json', import.meta.url), 'utf8'),
) as {
  cases: Array<{
    name: string;
    samples: Array<{
      at: number;
      amount: number;
      own: Array<{ at: number; card: CardId; cost: number }>;
      opponent: Array<{ at: number; cost: number }>;
      max: number;
    }>;
  }>;
};

describe('the opponent elixir bound the simulator screen reproduces', () => {
  it.each(shared.cases.map((item) => [item.name, item] as const))('%s', (_name, item) => {
    const ledger = new ElixirLedger();
    for (const sample of item.samples) {
      for (const play of sample.own) {
        expect(CARD_INFO[play.card].cost).toBe(play.cost);
        ledger.spendOwn(play.at, play.card);
      }
      for (const play of sample.opponent) ledger.observeOpponentSpend(play.at, play.at, play.cost);
      ledger.observeOwn(sample.at, sample.amount);
      expect(ledger.snapshot(sample.at).opponent).toEqual({ min: 0, max: sample.max });
    }
  });

  it('never subtracts a play it did not recognize, so the bound only rises to the cap', () => {
    const unseen = shared.cases.find((item) => item.samples.every((sample) => !sample.opponent.length));
    const bounds = unseen?.samples.map((sample) => sample.max) ?? [];
    expect(bounds.length).toBeGreaterThan(10);
    expect(bounds).toEqual(bounds.toSorted((a, b) => a - b));
    expect(bounds.at(-1)).toBe(10);
  });
});
