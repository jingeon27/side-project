import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { attemptAlpha, QUALIFICATION, realEvaluationGate } from './qualification.ts';

const cases = JSON.parse(
  await readFile(new URL('../../test-fixtures/qualification-cases.json', import.meta.url), 'utf8'),
) as {
  gates: Array<{
    name: string;
    wins: number;
    ties: number;
    losses: number;
    invalid: number;
    attempt: number;
    qualifies: boolean;
  }>;
};

describe('실전 채택 검정', () => {
  it('여러 번 평가해도 시도별 유의수준의 합이 전체 예산을 넘지 않는다', () => {
    expect(attemptAlpha(0)).toBe(QUALIFICATION.familyAlpha / 2);
    expect(attemptAlpha(1)).toBe(QUALIFICATION.familyAlpha / 6);
    const total = Array.from({ length: 1000 }, (_, attempt) => attemptAlpha(attempt)).reduce(
      (sum, alpha) => sum + alpha,
      0,
    );
    expect(total).toBeLessThan(QUALIFICATION.familyAlpha);
  });

  it.each(cases.gates)('"$name"의 통과 여부를 사례대로 판정한다', (gate) => {
    const scores = [
      ...Array<number>(gate.wins).fill(1),
      ...Array<number>(gate.ties).fill(0.5),
      ...Array<number>(gate.losses).fill(0),
      ...Array<number>(gate.invalid).fill(0.7),
    ];
    expect(realEvaluationGate(scores, attemptAlpha(gate.attempt)).passed).toBe(gate.qualifies);
  });
});
