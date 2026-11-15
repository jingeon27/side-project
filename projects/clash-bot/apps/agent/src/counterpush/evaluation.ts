import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { atomicWrite } from '../assets.ts';
import type { Profile } from '../config.ts';
import { LearningClient } from '../learning-client.ts';
import { selectModel, type ModelId } from '../model-options.ts';
import { acquireLearningLock } from '../selfplay.ts';
import { CounterpushBrowser } from './browser.ts';
import { playCounterpushEpisode } from './episode.ts';
import { CounterpushVisionClient } from './vision-client.ts';

type Result = { result: string; directory: string; actions: number; confirmed: number };
export function realEvaluationGate(pairScores: number[], alpha = 0.05) {
  if (!pairScores.length || pairScores.some((score) => !Number.isFinite(score) || score < 0 || score > 1))
    return { passed: false, reason: 'invalid_or_missing_pairs' };
  const mean = pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length;
  // Distribution-free bound on order-blocked pair scores in [0,1]. Unlike
  // local evaluation, the site does not offer shared environment RNG seeds.
  const radius = Math.sqrt(Math.log(2 / alpha) / (2 * pairScores.length));
  const lower = Math.max(0, mean - radius),
    upper = Math.min(1, mean + radius);
  return {
    passed: pairScores.length >= 16 && mean >= 0.55 && lower > 0.5,
    reason:
      pairScores.length >= 16 && lower > 0.5 && mean >= 0.55
        ? 'qualified'
        : 'insufficient_evidence_of_improvement',
    pairs: pairScores.length,
    score: mean,
    confidenceInterval: [lower, upper],
    bound: 'Hoeffding',
    alpha,
  };
}

export async function frozenComparison(options: {
  pairs: number;
  play: (variant: 'baseline' | 'candidate', pair: number) => Promise<Result>;
  stopped: () => Promise<boolean>;
  report: (state: Record<string, unknown>) => Promise<void>;
  alpha?: number;
}) {
  const games: Array<Result & { variant: 'baseline' | 'candidate'; pair: number; score: number }> = [];
  const scores: number[] = [];
  for (const pair of Array.from({ length: options.pairs }, (_, index) => index)) {
    const order = pair % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const);
    for (const variant of order) {
      if (await options.stopped()) break;
      const result = await options.play(variant, pair);
      if (!['win', 'loss', 'draw'].includes(result.result))
        throw new Error('평가 경기의 승패를 확인하지 못했습니다.');
      games.push({
        ...result,
        variant,
        pair,
        score: result.result === 'win' ? 1 : result.result === 'draw' ? 0.5 : 0,
      });
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
    const baseline = block.find((game) => game.variant === 'baseline')!.score;
    const candidate = block.find((game) => game.variant === 'candidate')!.score;
    scores.push(0.5 + (candidate - baseline) / 2);
  }
  const complete = scores.length === options.pairs;
  const gate = realEvaluationGate(scores, options.alpha);
  return {
    format: 'counterpush-frozen-ab-evaluation-v1',
    games,
    pairs: scores,
    complete,
    sameEnvironmentSeed: false,
    order: 'AB_BA_blocks',
    trainingDuringEvaluation: false,
    selection: 'categorical_as_live',
    gate: complete ? gate : { ...gate, passed: false, reason: 'interrupted_evaluation' },
    promoted: false,
  };
}

export async function runCounterpushEvaluation(options: {
  dataDir: string;
  profile: Profile;
  model: ModelId;
  candidate: string;
  pairs: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, model, signal } = options;
  const metadata = JSON.parse(await readFile(join(options.candidate, 'metadata.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const client = new LearningClient(dataDir, model);
  const vision = new CounterpushVisionClient(dataDir);
  const browserState: { browser: CounterpushBrowser | null } = { browser: null };
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    phase: 'evaluation_loading',
    model: selectModel(model, true).name,
    completed: 0,
    updates: 0,
    tabs: 1,
    candidate: options.candidate,
  };
  const file = join(control, 'evaluations', `${status.startedAt.replaceAll(':', '-')}.json`);
  const report = async (update: Record<string, unknown>) => {
    Object.assign(status, update, { updatedAt: new Date().toISOString() });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  };
  const abort = () => {
    client.close();
    vision.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'evaluation_loading' });
    await client.ready();
    await vision.ready();
    const baseline = await client.status();
    if (
      metadata.study_parent !== baseline.weights_sha256 ||
      metadata.weights_sha256 === baseline.weights_sha256
    )
      throw new Error(
        '이 후보가 현재 실전 모델에서 만들어지지 않았거나 가중치가 같습니다. 현재 모델에서 arena study로 새 후보를 만드세요.',
      );
    const base = join(
      dataDir,
      'qwen',
      selectModel(model, true).checkpoint_directory,
      'checkpoints',
      `v${String(baseline.version).padStart(6, '0')}`,
    );
    const browser = await CounterpushBrowser.open(dataDir);
    browserState.browser = browser;
    const deadline = Date.now() + options.hours * 3_600_000;
    const attemptsFile = join(control, 'evaluation-attempts.json');
    const attempts = await readFile(attemptsFile, 'utf8')
      .then((raw) => (JSON.parse(raw) as { count: number }).count)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return 0;
        throw error;
      });
    await atomicWrite(attemptsFile, JSON.stringify({ count: attempts + 1 }) + '\n');
    const alpha = 0.05 / ((attempts + 1) * (attempts + 2));
    const result = await frozenComparison({
      pairs: options.pairs,
      alpha,
      stopped: async () => {
        if (signal.aborted || Date.now() >= deadline) return true;
        const stop = await readFile(join(dataDir, 'qwen/selfplay/stop.json'), 'utf8').catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          },
        );
        return stop !== null && (JSON.parse(stop) as { id: string }).id === lock.owner.id;
      },
      play: async (variant, pair) => {
        const selected = await client.checkout(variant === 'baseline' ? base : options.candidate);
        await report({ phase: 'evaluating', pair: pair + 1, variant, policy: selected });
        try {
          const episode = await playCounterpushEpisode({
            ...options,
            client,
            vision,
            browser,
            report: async (state) => report({ ...state, phase: 'evaluating', variant, pair: pair + 1 }),
            persistPatterns: false,
          });
          const after = await client.status();
          if (selected.weights_sha256 !== after.weights_sha256)
            throw new Error('평가 도중 모델 가중치가 바뀌었습니다.');
          return episode;
        } finally {
          await client.checkout(null);
        }
      },
      report: async (state) => {
        await atomicWrite(
          file,
          JSON.stringify({ ...state, baseline, candidate: metadata, complete: false }, null, 2) + '\n',
        );
        await report({ ...state, phase: 'evaluating' });
      },
    });
    const final = {
      ...result,
      baseline,
      candidate: metadata,
      alphaSpendingAttempt: attempts,
      repeatedCandidateTestingCorrected: true,
      baselineUnchanged: (await client.status()).weights_sha256 === baseline.weights_sha256,
    };
    await atomicWrite(file, JSON.stringify(final, null, 2) + '\n');
    await report({
      phase: 'stopped',
      evaluationFile: file,
      gate: final.gate,
      baselineUnchanged: final.baselineUnchanged,
    });
    return final;
  } catch (error) {
    await browserState.browser?.screenshot(join(control, 'last-evaluation-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    client.close();
    vision.close();
    await browserState.browser?.close().catch(() => {});
    await lock.release();
  }
}
