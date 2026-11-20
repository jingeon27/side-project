import { readFileSync } from 'node:fs';

import { z } from 'zod';

// 트로피 실전 평가와 자가개선 감독이 같은 계약 파일로 채택 기준을 읽는다.
export const QUALIFICATION = z
  .object({
    version: z.literal(1),
    method: z.literal('paired_exact_wins_v1'),
    minimumPairs: z.int().positive(),
    minimumMeanScore: z.number().gt(0.5).lt(1),
    familyAlpha: z.number().gt(0).max(0.05),
  })
  .strict()
  .parse(JSON.parse(readFileSync(new URL('../../contracts/qualification.json', import.meta.url), 'utf8')));

// 시도 k마다 familyAlpha/((k+1)(k+2))를 써서 모든 시도의 합이 familyAlpha를 넘지 않는다.
export const attemptAlpha = (attempt: number) => QUALIFICATION.familyAlpha / ((attempt + 1) * (attempt + 2));

export function requiredEvaluationPairs(minimum: number, alpha: number) {
  if (minimum < QUALIFICATION.minimumPairs) return minimum; // Small manual smoke runs cannot qualify.
  return Math.max(minimum, Math.ceil(-Math.log2(alpha)) + 1);
}

export function realEvaluationGate(pairScores: number[], alpha = QUALIFICATION.familyAlpha) {
  const enough = (mean: number) =>
    pairScores.length >= QUALIFICATION.minimumPairs && mean >= QUALIFICATION.minimumMeanScore;
  if (
    !pairScores.length ||
    !Number.isFinite(alpha) ||
    alpha <= 0 ||
    alpha > QUALIFICATION.familyAlpha ||
    pairScores.some((score) => !Number.isFinite(score) || score < 0 || score > 1)
  )
    return { passed: false, reason: 'invalid_or_missing_pairs' };
  const mean = pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length;
  if (pairScores.some((value) => ![0, 0.5, 1].includes(value)))
    return { passed: false, reason: 'invalid_win_pair_score' };
  const wins = pairScores.filter((value) => value > 0.5).length,
    losses = pairScores.filter((value) => value < 0.5).length;
  const decisive = wins + losses;
  const sum = { combination: 1, tail: 0 };
  for (const count of Array.from({ length: decisive + 1 }, (_, index) => index)) {
    if (count >= wins) sum.tail += sum.combination;
    sum.combination *= (decisive - count) / (count + 1);
  }
  const probability = decisive ? sum.tail / 2 ** decisive : 1;
  const passed = enough(mean) && probability <= alpha;
  return {
    passed,
    reason: passed ? 'qualified' : 'insufficient_evidence_of_improvement',
    pairs: pairScores.length,
    score: mean,
    deltaWinRate: 2 * mean - 1,
    pairWins: wins,
    pairLosses: losses,
    oneSidedP: probability,
    test: 'exact_paired_binomial',
    alpha,
  };
}
