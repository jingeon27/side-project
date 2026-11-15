import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { DATA_DIR } from '../config.ts';
import { selectModel } from '../model-options.ts';
import { requestLearningStop } from '../selfplay.ts';
import { activeOpponentCoverage, learningAudit } from './audit.ts';
import { CounterpushBrowser } from './browser.ts';
import { loadCounterpushProfile } from './profile.ts';
import { reprocessEpisode } from './reprocess.ts';
import { runCounterpush } from './runner.ts';
import { CounterpushVisionClient } from './vision-client.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    hours: { type: 'string' },
    matches: { type: 'string' },
    tabs: { type: 'string' },
    model: { type: 'string' },
    profile: { type: 'string' },
    background: { type: 'boolean' },
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
            await loadCounterpushProfile(DATA_DIR, values.profile),
          ),
          null,
          2,
        ),
      );
    } finally {
      vision.close();
    }
    return;
  }
  if (command === 'audit') {
    const state = JSON.parse(await readFile(join(control, 'status.json'), 'utf8')) as {
      startedAt: string;
      policy: Record<string, unknown>;
    };
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
    const state = JSON.parse(await readFile(join(control, 'status.json'), 'utf8')) as Record<string, unknown>;
    const alive = () => {
      try {
        process.kill(Number(state.pid), 0);
        return true;
      } catch {
        return false;
      }
    };
    console.log(
      JSON.stringify(
        { ...state, running: !['stopped', 'failed', 'interrupted'].includes(String(state.phase)) && alive() },
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'stop') {
    const state = JSON.parse(await readFile(join(control, 'status.json'), 'utf8')) as { id: string };
    const lock = JSON.parse(await readFile(join(DATA_DIR, 'qwen/selfplay/lock.json'), 'utf8')) as {
      id: string;
    };
    if (state.id !== lock.id) throw new Error('현재 Counterpush 실행이 없습니다.');
    await requestLearningStop(join(DATA_DIR, 'qwen/selfplay'));
    console.log('이번 Counterpush 대전과 학습 후 중지합니다.');
    return;
  }
  if (command !== 'start') throw new Error('counterpush login|start|status|audit|rescan|stop');
  const hours = Number(values.hours ?? 8),
    matches = Number(values.matches ?? 0);
  const tabs = Number(values.tabs ?? 1);
  if (tabs !== 1)
    throw new Error('현재 Counterpush 계정은 동시 대전을 허용하지 않습니다. --tabs 1로 실행하세요.');
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 24 ||
    !Number.isInteger(matches) ||
    matches < 0 ||
    matches > 10000
  )
    throw new Error('hours는 0 초과 24 이하, matches는 0~10000 정수입니다. 0회는 반복입니다.');
  const model = selectModel(values.model, true).id;
  if (values.background) {
    const output = openSync(join(control, 'console.log'), 'a', 0o600);
    try {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          'start',
          '--hours',
          String(hours),
          '--matches',
          String(matches),
          '--model',
          model,
          '--tabs',
          String(tabs),
          ...(values.profile ? ['--profile', resolve(values.profile)] : []),
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
  await runCounterpush({
    dataDir: DATA_DIR,
    profile: await loadCounterpushProfile(DATA_DIR, values.profile),
    model,
    hours,
    matches,
    tabs,
    signal: abort.signal,
  });
};
main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
