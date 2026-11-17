import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { countBy, median, windowed } from 'es-toolkit';
import { z } from 'zod';

import { battleSituationSchema, type BattleSituation } from '../../core/battle/battle-state.ts';
import type { Profile } from '../../core/profile.ts';
import { atomicWrite } from '../../shared/assets.ts';

// 엘릭서 범위의 하한이 이 값 이상이면 넘친 충전량이 사라지는 상태로 본다.
const FULL_ELIXIR = 9.5;
// 이만큼 엘릭서가 있으면 막을 카드를 낼 수 있었다고 본다. 덱에서 가장 싼 수비 카드(해골 1·기사 3) 기준이다.
const DEFENSE_ELIXIR = 3;
// 이보다 짧게 우리 진영에 머문 상대 유닛은 수비 실패로 세지 않는다.
const ATTACK_SECONDS = 2;
// 공격이 보인 동안과 그 뒤 이 시간 안에 확인된 카드 사용을 그 공격에 대한 대응으로 본다.
const ANSWER_GRACE_MS = 5_000;

const stateRowSchema = z.object({
  version: z.literal(1),
  capturedAt: z.number(),
  inputPending: z.boolean(),
  situation: battleSituationSchema,
});
const candidateSchema = z.looseObject({ id: z.int(), slot: z.int(), kind: z.literal('ability').optional() });
const eventSchema = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('match_start'), at: z.number(), controllerVersion: z.int() }),
  z.looseObject({
    type: z.literal('prediction'),
    at: z.number(),
    frame: z.int(),
    text: z.string(),
    candidates: z.array(candidateSchema),
    situation: battleSituationSchema,
    elapsedMs: z.number(),
    captureToDecisionMs: z.number(),
    behavior: z.looseObject({ version: z.int().nullable().optional() }).optional(),
  }),
  z.looseObject({ type: z.literal('input_check'), at: z.number(), frame: z.int(), confirmed: z.boolean() }),
  z.looseObject({ type: z.literal('ability_check'), at: z.number(), frame: z.int(), confirmed: z.boolean() }),
  z.looseObject({ type: z.literal('rejected'), at: z.number(), reason: z.string() }),
  z.looseObject({
    type: z.literal('result'),
    at: z.number(),
    blue: z.int(),
    red: z.int(),
    outcome: z.enum(['win', 'loss', 'draw']),
  }),
  z.looseObject({
    type: z.enum([
      'input_sent',
      'ability_sent',
      'wait_check',
      'input_recovery',
      'opponent_action',
      'opponent_rejected',
    ]),
    at: z.number(),
  }),
]);
type MatchEvent = z.infer<typeof eventSchema>;
type Prediction = Extract<MatchEvent, { type: 'prediction' }>;

export const lossAnalysisSchema = z.strictObject({
  format: z.literal('counterpush-loss-analysis-v1'),
  controllerVersion: z.int(),
  policyVersion: z.int().nullable(),
  result: z.enum(['win', 'loss', 'draw']),
  crowns: z.strictObject({ own: z.int(), enemy: z.int() }),
  decisions: z.int().nonnegative(),
  elixir: z.strictObject({ fullSeconds: z.number().nonnegative(), waitedAtFull: z.int().nonnegative() }),
  attacks: z.strictObject({
    windows: z.int().nonnegative(),
    undefended: z.int().nonnegative(),
    waitedUnderAttack: z.int().nonnegative(),
    reactionMedianMs: z.number().nullable(),
  }),
  inputs: z.strictObject({
    confirmed: z.int().nonnegative(),
    unconfirmed: z.int().nonnegative(),
    rejected: z.record(z.string(), z.int().nonnegative()),
  }),
  latency: z.strictObject({
    decisionMedianMs: z.number().nullable(),
    captureMedianMs: z.number().nullable(),
  }),
  flaggedDecisions: z.array(
    z.strictObject({
      frame: z.int(),
      reasons: z.array(z.enum(['waited_at_full_elixir', 'waited_under_attack'])),
    }),
  ),
});
export type LossAnalysis = z.infer<typeof lossAnalysisSchema>;

const readLines = async <Row>(path: string, schema: z.ZodType<Row>) =>
  (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const parsed = schema.safeParse(JSON.parse(line));
      if (!parsed.success)
        throw new Error(`${path}:${index + 1} 기록 형식이 맞지 않습니다.\n${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });

const invaded = (situation: BattleSituation, profile: Profile) =>
  situation.opponent.units.some((unit) => unit.y > profile.riverY);
const chosenWait = (prediction: Prediction) => {
  const choice = z.object({ choice: z.int() }).parse(JSON.parse(prediction.text)).choice;
  const chosen = prediction.candidates.find((candidate) => candidate.id === choice);
  return chosen !== undefined && chosen.slot === 0 && chosen.kind === undefined;
};

// 상대 유닛이 우리 진영에 계속 머문 구간이다. 화면 사이 간격이 길면 다른 구간으로 나눈다.
function attackWindows(states: Array<z.infer<typeof stateRowSchema>>, profile: Profile) {
  const invadedAt = states.filter((row) => invaded(row.situation, profile)).map((row) => row.capturedAt);
  return invadedAt.reduce<Array<{ start: number; end: number; elixir: number }>>((windows, at) => {
    const last = windows.at(-1);
    if (last && at - last.end <= 1_500) return [...windows.slice(0, -1), { ...last, end: at }];
    const elixir = states.find((row) => row.capturedAt === at)!.situation.own.elixir.min;
    return [...windows, { start: at, end: at, elixir }];
  }, []);
}

// 기록만으로 확인할 수 있는 실수를 찾는다. 원인을 추측해 정답을 만들지 않고, 판단 번호와 이유만 남긴다.
export async function analyzeEpisode(directory: string, profile: Profile): Promise<LossAnalysis> {
  const events = await readLines(join(directory, 'events.jsonl'), eventSchema);
  const states = (await readLines(join(directory, 'states.jsonl'), stateRowSchema)).filter(
    (row) => !row.inputPending,
  );
  const start = events.find((event) => event.type === 'match_start');
  const result = events.findLast((event) => event.type === 'result');
  if (!start || !result) throw new Error(`${directory}: 결과가 확인된 완료 경기만 분석합니다.`);
  const predictions = events.filter((event): event is Prediction => event.type === 'prediction');
  const full = (situation: BattleSituation) => situation.own.elixir.min >= FULL_ELIXIR;
  const fullSeconds = windowed(states, 2).reduce(
    (total, [before, after]) =>
      total +
      (full(before!.situation) && full(after!.situation)
        ? (after!.capturedAt - before!.capturedAt) / 1000
        : 0),
    0,
  );
  const plays = events
    .filter((event) => event.type === 'input_check' && event.confirmed)
    .map((event) => event.at);
  const windows = attackWindows(states, profile).filter(
    (window) => window.end - window.start >= ATTACK_SECONDS * 1000,
  );
  const answers = windows.map((window) => ({
    window,
    answer: plays.find((at) => at >= window.start && at <= window.end + ANSWER_GRACE_MS),
  }));
  const reactions = answers.flatMap(({ window, answer }) =>
    answer === undefined ? [] : [answer - window.start],
  );
  const underAttack = (at: number) => windows.some((window) => at >= window.start && at <= window.end);
  const flaggedDecisions = predictions.flatMap((prediction) => {
    if (!chosenWait(prediction)) return [];
    const reasons = [
      ...(full(prediction.situation) ? (['waited_at_full_elixir'] as const) : []),
      ...(underAttack(prediction.at) && prediction.situation.own.elixir.min >= DEFENSE_ELIXIR
        ? (['waited_under_attack'] as const)
        : []),
    ];
    return reasons.length ? [{ frame: prediction.frame, reasons }] : [];
  });
  const checks = events.filter((event) => event.type === 'input_check' || event.type === 'ability_check');
  const analysis: LossAnalysis = {
    format: 'counterpush-loss-analysis-v1',
    controllerVersion: start.controllerVersion,
    policyVersion:
      predictions.find((prediction) => prediction.behavior?.version != null)?.behavior?.version ?? null,
    result: result.outcome,
    crowns: { own: result.blue, enemy: result.red },
    decisions: predictions.length,
    elixir: {
      fullSeconds: Math.round(fullSeconds * 10) / 10,
      waitedAtFull: flaggedDecisions.filter((item) => item.reasons.includes('waited_at_full_elixir')).length,
    },
    attacks: {
      windows: windows.length,
      undefended: answers.filter(
        ({ window, answer }) => answer === undefined && window.elixir >= DEFENSE_ELIXIR,
      ).length,
      waitedUnderAttack: flaggedDecisions.filter((item) => item.reasons.includes('waited_under_attack'))
        .length,
      reactionMedianMs: reactions.length ? median(reactions) : null,
    },
    inputs: {
      confirmed: checks.filter((event) => event.confirmed).length,
      unconfirmed: checks.filter((event) => !event.confirmed).length,
      rejected: countBy(
        events.filter((event) => event.type === 'rejected'),
        (event) => event.reason,
      ),
    },
    latency: {
      decisionMedianMs: predictions.length ? median(predictions.map((item) => item.elapsedMs)) : null,
      captureMedianMs: predictions.length
        ? median(predictions.map((item) => item.captureToDecisionMs))
        : null,
    },
    flaggedDecisions,
  };
  await atomicWrite(join(directory, 'loss-analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
  return analysis;
}
