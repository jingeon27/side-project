import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { DATA_DIR } from '../shared/config.ts';
import { readJsonFile } from '../shared/json-file.ts';
import { readLockOwner, readRunStatus, requestLearningStop } from '../shared/runtime-lock.ts';
import { activeOpponentCoverage, learningAudit } from './learning/audit.ts';
import { runCounterpushEvaluation } from './learning/evaluation.ts';
import { reprocessEpisode } from './learning/reprocess.ts';
import { CounterpushVisionClient } from './perception/vision-client.ts';
import { CounterpushBrowser } from './runtime/browser.ts';
import { loadCounterpushProfile } from './runtime/profile.ts';
import { runCounterpush } from './runtime/runner.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    hours: { type: 'string' },
    matches: { type: 'string' },
    tabs: { type: 'string' },
    profile: { type: 'string' },
    background: { type: 'boolean' },
    candidate: { type: 'string' },
    pairs: { type: 'string' },
    resume: { type: 'boolean' },
    'training-matches': { type: 'string' },
    'training-goal': { type: 'string' },
  },
});
const command = positionals[0] ?? 'status';
const control = join(DATA_DIR, 'counterpush/control');
const main = async () => {
  await mkdir(control, { recursive: true, mode: 0o700 });
  if (command === 'login') {
    console.log(
      '전용 Chrome에서 직접 로그인하고 양쪽 덱을 GY GobHut Evo Furnace로 맞춰주세요. 최대 10분 기다립니다.',
    );
    const browser = await CounterpushBrowser.open(DATA_DIR, 600_000);
    await browser.close();
    console.log('전용 브라우저의 로그인과 덱을 확인했습니다.');
    return;
  }
  if (command === 'rescan') {
    if (!positionals[1]) throw new Error('다시 인식할 완료 경기 폴더를 지정해주세요.');
    const vision = new CounterpushVisionClient(DATA_DIR);
    try {
      await vision.ready();
      console.log(
        JSON.stringify(
          await reprocessEpisode(
            vision,
            DATA_DIR,
            resolve(positionals[1]),
            await loadCounterpushProfile(values.profile),
          ),
          null,
          2,
        ),
      );
    } finally {
      await vision.close();
    }
    return;
  }
  if (command === 'audit') {
    const state = await readJsonFile(
      join(control, 'status.json'),
      z.looseObject({ startedAt: z.iso.datetime(), policy: z.record(z.string(), z.unknown()) }),
    );
    console.log(
      JSON.stringify(
        {
          ...(await learningAudit(DATA_DIR, state.startedAt)),
          activePolicyOpponentLearning: await activeOpponentCoverage(DATA_DIR, state.policy),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify(await readRunStatus(control), null, 2));
    return;
  }
  if (command === 'stop') {
    const state = await readRunStatus(control);
    const lock = await readLockOwner(join(DATA_DIR, 'qwen/selfplay'));
    if (state.id !== lock?.id) throw new Error('현재 Counterpush 실행이 없습니다.');
    await requestLearningStop(join(DATA_DIR, 'qwen/selfplay'));
    console.log('현재 경기와 후보 저장 후 중지합니다. 평가 기록은 다음 실행에서 이어집니다.');
    return;
  }
  if (!['start', 'evaluate'].includes(command))
    throw new Error('counterpush login|start|evaluate|status|audit|rescan|stop');
  const hours = Number(values.hours ?? (command === 'start' ? 0 : 8)),
    matches = Number(values.matches ?? 0);
  const tabs = Number(values.tabs ?? 1);
  if (tabs !== 1)
    throw new Error('현재 Counterpush 계정은 동시 대전을 허용하지 않습니다. --tabs 1로 실행하세요.');
  if (
    !Number.isFinite(hours) ||
    hours < 0 ||
    hours > 24 ||
    !Number.isInteger(matches) ||
    matches < 0 ||
    matches > 10000
  )
    throw new Error('hours는 0~24, matches는 0~10000 정수입니다. 0은 중지 요청까지 반복합니다.');
  const pairs = Number(values.pairs ?? 16);
  const trainingMatches = Number(values['training-matches'] ?? 8);
  const trainingGoal = values['training-goal'] ? Number(values['training-goal']) : undefined;
  if (
    trainingGoal !== undefined &&
    (!Number.isInteger(trainingGoal) || trainingGoal < 1 || trainingGoal > 10000)
  )
    throw new Error('training-goal은 1~10000판입니다.');
  if (
    command === 'start' &&
    (!Number.isInteger(pairs) ||
      pairs < 16 ||
      pairs > 128 ||
      !Number.isInteger(trainingMatches) ||
      trainingMatches < 1 ||
      trainingMatches > 128)
  )
    throw new Error('자동 채택은 pairs 16~128, training-matches 1~128를 사용합니다.');
  if (command === 'evaluate' && (!values.candidate || !Number.isInteger(pairs) || pairs < 1 || pairs > 128))
    throw new Error('evaluate --candidate <후보 체크포인트 폴더> --pairs <1~128>');
  if (values.background) {
    const output = openSync(join(control, 'console.log'), 'a', 0o600);
    try {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          command,
          '--hours',
          String(hours),
          '--matches',
          String(matches),
          '--tabs',
          String(tabs),
          ...(values.profile ? ['--profile', resolve(values.profile)] : []),
          ...(values.candidate ? ['--candidate', resolve(values.candidate)] : []),
          ...(values.pairs ? ['--pairs', String(pairs)] : []),
          ...(values.resume ? ['--resume'] : []),
          ...(values['training-matches'] ? ['--training-matches', String(trainingMatches)] : []),
          ...(trainingGoal ? ['--training-goal', String(trainingGoal)] : []),
        ],
        { detached: true, stdio: ['ignore', output, output], cwd: process.cwd() },
      );
      child.unref();
      console.log(
        JSON.stringify({
          started: true,
          pid: child.pid,
          hours,
          matches,
          tabs,
          log: join(control, 'console.log'),
        }),
      );
    } finally {
      closeSync(output);
    }
    return;
  }
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  if (command === 'evaluate') {
    const result = await runCounterpushEvaluation({
      dataDir: DATA_DIR,
      profile: await loadCounterpushProfile(values.profile),
      pairs,
      hours,
      candidate: resolve(values.candidate!),
      signal: abort.signal,
    });
    console.log(
      JSON.stringify(
        {
          complete: result.complete,
          gate: result.gate,
          promoted: result.promoted,
          baselineUnchanged: result.baselineUnchanged,
        },
        null,
        2,
      ),
    );
    if (!values.resume || abort.signal.aborted || !result.complete) return;
  }
  await runCounterpush({
    dataDir: DATA_DIR,
    profile: await loadCounterpushProfile(values.profile),
    hours,
    matches,
    trainingGoal,
    tabs,
    pairs,
    trainingMatches,
    signal: abort.signal,
  });
};
main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
