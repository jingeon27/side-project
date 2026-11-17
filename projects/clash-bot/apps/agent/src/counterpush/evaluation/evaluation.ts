import { QUALIFICATION, realEvaluationGate } from '../../shared/qualification.ts';

type Result = {
  result: string;
  directory: string;
  actions: number;
  confirmed: number;
  weightsSHA256?: string;
  checkpoint?: string;
};
export type EvaluatedGame = Result & { variant: 'baseline' | 'candidate'; pair: number; score: number };
// 평가는 쌍마다 이긴 쪽만 세는 정확 이항 검정 하나다. 무승부는 이긴 판으로 세지 않는다.
export const EVALUATION_METHOD = QUALIFICATION.method;
const scoreOf = (result: string) => (result === 'win' ? 1 : 0);
const orderOf = (pair: number) =>
  pair % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const);

export async function retryInputRecovery<T extends { learningEligible?: boolean }>(
  play: () => Promise<T>,
  excluded: (episode: T) => Promise<void>,
  attemptsLeft = 3,
): Promise<T> {
  if (attemptsLeft < 1) throw new Error('입력 확인이 3경기 연속 실패해 평가를 중단했습니다.');
  const episode = await play();
  if (episode.learningEligible !== false) return episode;
  await excluded(episode);
  return retryInputRecovery(play, excluded, attemptsLeft - 1);
}

export async function frozenComparison(options: {
  pairs: number;
  play: (variant: 'baseline' | 'candidate', pair: number) => Promise<Result>;
  stopped: () => Promise<boolean>;
  report: (state: Record<string, unknown>) => Promise<void>;
  alpha?: number;
  existingGames?: EvaluatedGame[];
  rejectFutile?: boolean;
}) {
  const games: EvaluatedGame[] = [...(options.existingGames ?? [])];
  if (games.length > options.pairs * 2 || new Set(games.map((game) => game.directory)).size !== games.length)
    throw new Error('중복되거나 범위를 벗어난 평가 경기입니다.');
  for (const [index, game] of games.entries()) {
    const pair = Math.floor(index / 2);
    if (
      game.pair !== pair ||
      game.variant !== orderOf(pair)[index % 2] ||
      !['win', 'loss', 'draw'].includes(game.result) ||
      game.score !== scoreOf(game.result)
    )
      throw new Error('평가 재개 기록의 순서 또는 승패가 맞지 않습니다.');
  }
  const scores: number[] = [];
  const cannotQualify = () =>
    Boolean(options.rejectFutile) &&
    scores.length > 0 &&
    games.length === scores.length * 2 &&
    options.pairs >= QUALIFICATION.minimumPairs &&
    !realEvaluationGate([...scores, ...Array<number>(options.pairs - scores.length).fill(1)], options.alpha)
      .passed;
  for (const pair of Array.from({ length: options.pairs }, (_, index) => index)) {
    for (const variant of orderOf(pair)) {
      if (games.some((game) => game.pair === pair && game.variant === variant)) continue;
      if (await options.stopped()) break;
      const result = await options.play(variant, pair);
      if (!['win', 'loss', 'draw'].includes(result.result))
        throw new Error('평가 경기의 승패를 확인하지 못했습니다.');
      games.push({ ...result, variant, pair, score: scoreOf(result.result) });
      await options.report({
        pair: pair + 1,
        variant,
        completed: games.length,
        lastResult: result.result,
        games,
      });
    }
    const block = games.filter((game) => game.pair === pair);
    if (block.length !== 2) break;
    scores.push(
      0.5 +
        (block.find((game) => game.variant === 'candidate')!.score -
          block.find((game) => game.variant === 'baseline')!.score) /
          2,
    );
    // Rejection only: even winning every remaining pair could not pass the
    // original full-sample gate. Never accept early or recycle its alpha.
    if (cannotQualify()) break;
  }
  const complete = scores.length === options.pairs;
  const rejectedEarly = !complete && cannotQualify();
  const gate = realEvaluationGate(scores, options.alpha);
  return {
    format: 'counterpush-frozen-ab-evaluation-v2',
    games,
    pairs: scores,
    complete,
    rejectedEarly,
    sameEnvironmentSeed: false,
    order: 'AB_BA_blocks',
    trainingDuringEvaluation: false,
    selection: 'categorical_as_live',
    method: EVALUATION_METHOD,
    gate: complete
      ? gate
      : {
          ...gate,
          passed: false,
          reason: rejectedEarly ? 'cannot_qualify_with_remaining_pairs' : 'interrupted_evaluation',
        },
    promoted: false,
  };
}
