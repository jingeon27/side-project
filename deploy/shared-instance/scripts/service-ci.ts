import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { matchesGlob, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type TService = 'game-feedback' | 'photo-contest';
interface ISelection {
  gameFeedback: boolean;
  photoContest: boolean;
}

const COMMON_PATHS = [
  'packages/**',
  'package.json',
  'yarn.lock',
  'scripts/**',
  'tsconfig.scripts.json',
  '.yarnrc.yml',
  '.nvmrc',
  '.prettierrc.json',
  '.prettierignore',
  '.dockerignore',
  '.github/workflows/services.yml',
  '.github/workflows/shared-instance.yml',
  '.github/workflows/chat-benchmark.yml',
  'deploy/shared-instance/**',
] as const;

/** 검사 선택과 오래된 배포 판정이 같은 변경 범위를 사용한다. */
export function servicePaths(service: TService) {
  return [`projects/${service}/**`, `.github/workflows/${service}.yml`, ...COMMON_PATHS];
}

export function selectServices({
  files,
  forceAll = false,
}: {
  files: string[];
  forceAll?: boolean;
}): ISelection {
  const changed = (service: TService) =>
    forceAll || files.some((file) => servicePaths(service).some((pattern) => matchesGlob(file, pattern)));
  return { gameFeedback: changed('game-feedback'), photoContest: changed('photo-contest') };
}

export function requiredChecks({ gameFeedback, photoContest }: ISelection) {
  return [
    'selection',
    ...(gameFeedback || photoContest ? ['shared-contract'] : []),
    ...(gameFeedback ? ['gf-verify', 'gf-integration', 'gf-components'] : []),
    ...(photoContest ? ['pc-verify', 'pc-browser', 'pc-components', 'pc-containers'] : []),
  ];
}

export function failedChecks({
  selection,
  results,
}: {
  selection: ISelection;
  results: Record<string, string>;
}) {
  // 선택한 검사의 skip·cancel도 실패다. 경로 필터가 필수 검사를 조용히 생략하지 못하게 한다.
  return requiredChecks(selection).filter((name) => results[name] !== 'success');
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function selectFromEvent() {
  const event = record(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')));
  const pull = record(event.pull_request);
  const base = process.env.GITHUB_EVENT_NAME === 'pull_request' ? record(pull.base).sha : event.before;
  const validBase = typeof base === 'string' && /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base);
  const files = validBase
    ? execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'], { encoding: 'utf8' })
        .split('\0')
        .filter(Boolean)
    : [];
  const selected = selectServices({ files, forceAll: !validBase });
  appendFileSync(
    process.env.GITHUB_OUTPUT ?? '',
    `game-feedback=${selected.gameFeedback}\nphoto-contest=${selected.photoContest}\n`,
  );
}

function verifyResults() {
  const needs = record(JSON.parse(process.env.CI_NEEDS ?? '{}'));
  const outputs = record(record(needs.selection).outputs);
  if (
    !['true', 'false'].includes(String(outputs['game-feedback'])) ||
    !['true', 'false'].includes(String(outputs['photo-contest']))
  )
    throw new Error('Service selection did not produce both decisions');
  const selection = {
    gameFeedback: outputs['game-feedback'] === 'true',
    photoContest: outputs['photo-contest'] === 'true',
  };
  const results = Object.fromEntries(
    Object.entries(needs).map(([name, value]) => [name, String(record(value).result)]),
  );
  const failed = failedChecks({ selection, results });
  const rows = requiredChecks(selection).map((name) => `| ${name} | ${results[name] ?? 'missing'} |`);
  const summary = ['## Service verification', '', '| Check | Result |', '| --- | --- |', ...rows, ''].join(
    '\n',
  );
  const reproduce: Record<string, string> = {
    'gf-verify': 'yarn check:game-feedback && yarn workspace @side/game-feedback test:unit',
    'gf-integration':
      'yarn workspace @game-feedback/api test:integration && yarn workspace @side/game-feedback test:e2e',
    'gf-components': 'yarn workspace @game-feedback/admin test:browser',
    'pc-verify':
      'yarn workspace @side/photo-contest check && yarn workspace @photo-contest/api test:integration',
    'pc-browser':
      'yarn workspace @photo-contest/web test:e2e && yarn workspace @photo-contest/mobile test:e2e',
    'pc-components': 'yarn workspace @photo-contest/web test:browser',
    'pc-containers': 'bash projects/photo-contest/apps/web/test/deployment/containers.sh',
    'shared-contract':
      'node projects/game-feedback/apps/api/scripts/shared-instance-smoke.ts <verified-image-sha>',
    selection: 'node deploy/shared-instance/scripts/service-ci.ts select',
  };
  const commands = failed.map((name) => `- ${name}: \`${reproduce[name]}\``);
  const details = commands.length
    ? `\n### Reproduce the failed area\n\n${commands.join('\n')}\n\nDatabase, S3 and image prerequisites: docs/development.md.\n`
    : '';
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + details);
  process.stdout.write(summary + details);
  if (failed.length) throw new Error(`Required service checks did not pass: ${failed.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (command === 'select') selectFromEvent();
    if (command === 'verify') verifyResults();
    if (command === 'paths') {
      const service = process.argv[3];
      if (service !== 'game-feedback' && service !== 'photo-contest') throw new Error('Unknown service');
      process.stdout.write(`${servicePaths(service).join('\n')}\n`);
    }
    if (!['select', 'verify', 'paths'].includes(command ?? '')) throw new Error('Unknown CI command');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Service CI failed'}\n`);
    process.exitCode = 1;
  }
}
