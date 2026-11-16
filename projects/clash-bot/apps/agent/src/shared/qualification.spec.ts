import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { realEvaluationGate } from '../counterpush/learning/evaluation.ts';
import { parseBrowserResult } from '../counterpush/runtime/browser.ts';
import { attemptAlpha, QUALIFICATION } from './qualification.ts';

// Python 게시 검사(clash_bot.qwen.promotion_gate_test)도 같은 사례 파일을 같은 결과로 판정해야 한다.
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
  resultLabels: Array<{ label: string; blue: number | null; red: number | null }>;
};

describe('qualification contract shared with the Python promotion gate', () => {
  it('spends the family-wise budget across attempts without exceeding it', () => {
    expect(attemptAlpha(0)).toBe(QUALIFICATION.familyAlpha / 2);
    expect(attemptAlpha(1)).toBe(QUALIFICATION.familyAlpha / 6);
    const total = Array.from({ length: 1000 }, (_, attempt) => attemptAlpha(attempt)).reduce(
      (sum, alpha) => sum + alpha,
      0,
    );
    expect(total).toBeLessThan(QUALIFICATION.familyAlpha);
  });

  it.each(cases.gates)('decides "$name" as the Python gate does', (gate) => {
    const scores = [
      ...Array<number>(gate.wins).fill(1),
      ...Array<number>(gate.ties).fill(0.5),
      ...Array<number>(gate.losses).fill(0),
      ...Array<number>(gate.invalid).fill(0.7),
    ];
    expect(realEvaluationGate(scores, attemptAlpha(gate.attempt)).passed).toBe(gate.qualifies);
  });

  it.each(cases.resultLabels)('reads the result label "$label" as the Python verifier does', (row) => {
    const result = parseBrowserResult(row.label);
    expect(result && { blue: result.blue, red: result.red }).toEqual(
      row.blue === null ? null : { blue: row.blue, red: row.red },
    );
  });
});
