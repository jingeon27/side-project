import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const policy = fileURLToPath(new URL('./service-ci.ts', import.meta.url));
const superseded = fileURLToPath(new URL('./ci-superseded.sh', import.meta.url));
const state = {} as { directory: string };
const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=CI', '-c', 'user.email=ci@example.test', '-c', 'commit.gpgsign=false', ...args],
    { cwd: state.directory, encoding: 'utf8' },
  ).trim();

function commit(file: string) {
  const path = join(state.directory, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'review fixture\n');
  git('add', '--', file);
  git('commit', '-q', '-m', file);
  return git('rev-parse', 'HEAD');
}

function run(binary: string, args: string[], release: string) {
  const output = join(state.directory, '.output');
  writeFileSync(output, '');
  const result = spawnSync(binary, args, {
    cwd: state.directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_PATH: join(state.directory, '.event.json'),
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(state.directory, '.summary'),
      RELEASE_SHA: release,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(output, 'utf8').trim();
}

interface IManifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const manifest = (directory: string) =>
  JSON.parse(readFileSync(join(repo, directory, 'package.json'), 'utf8')) as IManifest;
const workflow = (name: string) => readFileSync(join(repo, '.github/workflows', name), 'utf8');

/** workflow의 job별 이름, needs와 if 조건을 읽는다. job의 if는 && 로만 잇는 한 줄로 쓴다. */
function workflowJobs(name: string) {
  const jobs = workflow(name).split(/^jobs:\n/m)[1] ?? '';
  return new Map(
    jobs.split(/^ {2}(?=[\w-]+:\n)/m).flatMap((block) => {
      const id = /^([\w-]+):\n/.exec(block)?.[1];
      if (!id) return [];
      const inline = /^ {4}needs: (.+)$/m.exec(block)?.[1];
      const listed = /^ {4}needs:\n((?: {6}- .+\n)+)/m.exec(block)?.[1] ?? '';
      const needs = inline
        ? inline
            .replace(/[[\]]/g, '')
            .split(',')
            .map((need) => need.trim())
        : [...listed.matchAll(/- (.+)/g)].map((match) => match[1] ?? '');
      const condition = /^ {4}if: (.+)$/m.exec(block)?.[1] ?? '';
      const title = /^ {4}name: (.+)$/m.exec(block)?.[1] ?? id;
      return [[id, { title, needs, condition, terms: condition.split(' && ') }] as const];
    }),
  );
}

/** workflow의 최상위 절(on:, concurrency:)을 읽는다. */
const section = (source: string, key: string) =>
  source.split(new RegExp(`^${key}:\\n`, 'm'))[1]?.split(/^\S/m)[0] ?? '';

/** 이름으로 찾은 step의 run 스크립트를 읽는다. run은 블록 스칼라(|)로 쓴다. */
function stepScript(source: string, step: string) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${step}`);
  expect(start, step).toBeGreaterThan(-1);
  const run = lines.findIndex((line, index) => index > start && /^\s+run: \|$/.test(line));
  const body = lines.slice(run + 1);
  const indent = body[0]?.search(/\S/) ?? 0;
  const end = body.findIndex((line) => line.trim() !== '' && line.search(/\S/) < indent);
  return body
    .slice(0, end < 0 ? undefined : end)
    .map((line) => line.slice(indent))
    .join('\n');
}

/** GitHub Actions의 기본 셸처럼 bash -e로 workflow step을 실행한다. */
const runStep = (script: string, env: Record<string, string>, cwd?: string) =>
  spawnSync('bash', ['-e', '-c', script], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

/** 앱이 workspace: 로 의존하는 공유 패키지 디렉터리를 간접 의존까지 모은다. */
function sharedPackages(directory: string): string[] {
  const shared = new Map(
    readdirSync(join(repo, 'packages'))
      .filter((name) => existsSync(join(repo, 'packages', name, 'package.json')))
      .map((name) => [manifest(`packages/${name}`).name, `packages/${name}`]),
  );
  const app = manifest(directory);
  const found = Object.entries({ ...app.dependencies, ...app.devDependencies }).flatMap(([name, version]) => {
    const path = shared.get(name);
    return path && version.startsWith('workspace:') ? [path, ...sharedPackages(path)] : [];
  });
  return [...new Set(found)];
}

describe('숨김 경로의 검사 선택과 배포 생략', () => {
  beforeEach(() => {
    state.directory = mkdtempSync(join(tmpdir(), 'service-ci-hidden-path-'));
    git('init', '-q', '-b', 'main');
  });
  afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

  it.each([
    ['projects/game-feedback/.env.example', 'game-feedback', true, false],
    ['projects/game-feedback/apps/web/.npmrc', 'game-feedback', true, false],
    ['projects/photo-contest/.env.example', 'photo-contest', false, true],
    ['packages/design-system/.storybook/main.ts', 'game-feedback', true, true],
    ['projects/game-feedback-copy/.env.example', 'game-feedback', false, false],
    ['packages-old/.storybook/main.ts', 'game-feedback', false, false],
  ] as const)(
    '%s 변경으로 검증한 배포가 누락되지 않아야 한다',
    (file, service, gameFeedback, photoContest) => {
      const release = commit(`projects/${service}/apps/api/src/main.ts`);
      const latest = commit(file);
      git('update-ref', 'refs/remotes/origin/main', latest);
      writeFileSync(join(state.directory, '.event.json'), JSON.stringify({ before: release }));

      expect(run(process.execPath, [policy, 'select'], release)).toBe(
        `game-feedback=${gameFeedback}\nphoto-contest=${photoContest}\nproduction=true`,
      );
      const selected = service === 'game-feedback' ? gameFeedback : photoContest;
      expect(run('bash', [superseded, service, 'main'], release)).toBe(`deploy=${!selected}`);
      if (selected) expect(run('bash', [superseded, service, 'main'], latest)).toBe('deploy=true');
    },
  );
});

describe('운영 발행·배포 job 조건', () => {
  // 한 서비스만 바뀐 실행에서는 다른 서비스 검사가 skipped다. 상태 함수가 없는 if는 암묵적 success()가
  // 의존 사슬 위의 skipped까지 이어받아, verification이 성공해도 발행·배포를 조용히 건너뛴다.
  it('verification 뒤의 job은 취소 여부와 바로 앞 job의 성공을 직접 확인해야 한다', () => {
    const jobs = workflowJobs('services.yml');
    const reference = (job: string) => (job.includes('-') ? `needs['${job}']` : `needs.${job}`);
    const after = (gate: string): string[] =>
      [...jobs].filter(([, job]) => job.needs.includes(gate)).flatMap(([name]) => [name, ...after(name)]);
    const gated = [...new Set(after('verification'))];

    expect(gated).toEqual(expect.arrayContaining(['gf-publish', 'gf-deploy', 'pc-publish', 'pc-deploy']));
    for (const name of gated) {
      const job = jobs.get(name);
      expect(job?.terms, name).toContain('!cancelled()');
      for (const need of job?.needs.filter((need) => need !== 'selection') ?? [])
        expect(job?.terms, name).toContain(`${reference(need)}.result == 'success'`);
    }
  });

  it.each([
    ['gf-publish', 'game-feedback', 'GAME_FEEDBACK'],
    ['pc-publish', 'photo-contest', 'PHOTO_CONTEST'],
  ])('%s는 운영 실행에서 %s가 바뀌고 배포를 켰을 때만 발행해야 한다', (name, service, variable) => {
    expect(workflowJobs('services.yml').get(name)?.terms).toEqual(
      expect.arrayContaining([
        "needs.selection.outputs.production == 'true'",
        `needs.selection.outputs['${service}'] == 'true'`,
        `vars.${variable}_DEPLOY_ENABLED == 'true'`,
      ]),
    );
  });
});

describe('필수 검사로 지정하는 집계 job', () => {
  // workflow 단위 경로 필터로 실행되지 않은 검사는 대기 상태로 남고, 조건 때문에 건너뛴 job은 통과로 보인다.
  // 그래서 workflow는 모든 PR에서 실행하고, 항상 실행되는 집계 job 하나가 선택한 검사의 결과를 모은다.
  it.each([
    ['services.yml', 'Service verification'],
    ['blog.yml', 'Blog verification'],
  ])('%s workflow는 경로 필터 없이 실행하고 %s 하나가 앞선 검사를 모두 모아야 한다', (file, title) => {
    expect(section(workflow(file), 'on')).not.toMatch(/^\s+paths(?:-ignore)?:/m);
    const jobs = workflowJobs(file);
    const gates = [...jobs].filter(([, job]) => job.condition === 'always()');
    const after = (gate: string): string[] =>
      [...jobs].filter(([, job]) => job.needs.includes(gate)).flatMap(([name]) => [name, ...after(name)]);

    expect(gates.map(([, job]) => job.title)).toEqual([title]);
    for (const [gate, job] of gates) {
      const downstream = new Set(after(gate));
      expect(new Set(job.needs)).toEqual(
        new Set([...jobs.keys()].filter((name) => name !== gate && !downstream.has(name))),
      );
    }
  });

  it('static-analysis.yml workflow는 경로 필터 없이 실행하고 필수 검사 knip을 조건 없이 실행해야 한다', () => {
    const knip = workflowJobs('static-analysis.yml').get('knip');

    expect(section(workflow('static-analysis.yml'), 'on')).not.toMatch(/^\s+paths(?:-ignore)?:/m);
    expect(knip?.title).toBe('knip');
    expect(knip?.condition).toBe('');
  });

  it('서비스와 무관한 변경은 선택한 검사 없이 Service verification을 통과해야 한다', () => {
    const lanes = workflowJobs('services.yml')
      .get('verification')
      ?.needs.filter((name) => name !== 'selection');
    const verify = (selection: string) =>
      spawnSync(process.execPath, [policy, 'verify'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          CI_NEEDS: JSON.stringify({
            selection: {
              result: selection,
              outputs: { 'game-feedback': 'false', 'photo-contest': 'false', production: 'false' },
            },
            ...Object.fromEntries((lanes ?? []).map((name) => [name, { result: 'skipped', outputs: {} }])),
          }),
        },
      });

    const passed = verify('success');
    expect(lanes).toEqual(expect.arrayContaining(['shared-contract', 'gf-verify', 'pc-verify']));
    expect(passed.status, passed.stderr).toBe(0);
    expect(verify('cancelled').status).toBe(1);
  });

  it.each([
    ['success', 'false', 'skipped', 0],
    ['success', 'true', 'success', 0],
    ['success', 'true', 'failure', 1],
    ['success', 'true', 'cancelled', 1],
    ['success', 'true', 'skipped', 1],
    ['success', '', 'skipped', 1],
    ['failure', '', 'skipped', 1],
    ['cancelled', '', 'skipped', 1],
  ])(
    'selection이 %s, blog=%j, verify가 %s이면 Blog verification은 %i로 끝나야 한다',
    (selection, selected, verify, status) => {
      const script = stepScript(workflow('blog.yml'), 'Require the selected blog verification');
      expect(runStep(script, { SELECTION: selection, SELECTED: selected, VERIFY: verify }).status).toBe(
        status,
      );
    },
  );
});

describe('push 실행의 검사 보존', () => {
  // push는 자기 diff로 검사를 고르므로, 다음 push가 이전 실행을 취소하면 그 변경은 검사 없이 지나간다.
  it.each(['services.yml', 'blog.yml', 'static-analysis.yml'])(
    '%s workflow는 PR의 이전 실행만 취소하고 push 실행은 취소하지 않아야 한다',
    (file) => {
      expect(section(workflow(file), 'concurrency')).toMatch(
        /github\.event_name == 'pull_request' && format\('pr-\{0\}', github\.event\.pull_request\.number\)\s+\|\| github\.run_id \}\}/,
      );
    },
  );
});

describe('Blog 검증 선택', () => {
  beforeEach(() => {
    state.directory = mkdtempSync(join(tmpdir(), 'blog-ci-selection-'));
    git('init', '-q', '-b', 'main');
    commit('initial.txt');
  });
  afterEach(() => rmSync(state.directory, { recursive: true, force: true }));

  /** selection step을 base와 HEAD의 diff로 실행하고 output을 읽는다. */
  function select(base: string) {
    const output = join(state.directory, '.output');
    writeFileSync(output, '');
    const script = stepScript(workflow('blog.yml'), 'Select blog verification');
    const result = runStep(script, { BASE_SHA: base, GITHUB_OUTPUT: output }, state.directory);
    expect(result.status, result.stderr).toBe(0);
    return readFileSync(output, 'utf8').trim();
  }

  it.each([
    ['projects/blog/apps/web/content/posts/post/ko.mdx', true],
    ['projects/blog/apps/web/.env.example', true],
    ['.github/workflows/blog.yml', true],
    ['yarn.lock', true],
    ['projects/blog-archive/post.mdx', false],
    ['projects/game-feedback/apps/web/src/page.tsx', false],
    ['.github/workflows/services.yml', false],
    ['README.md', false],
  ] as const)('%s 변경이면 Blog 검증 선택은 %s여야 한다', (file, expected) => {
    const base = git('rev-parse', 'HEAD');
    commit(file);
    expect(select(base)).toBe(`blog=${expected}`);
  });

  it('블로그 앱이 쓰는 공유 패키지만 바뀌어도 Blog 검증을 선택해야 한다', () => {
    const packages = sharedPackages('projects/blog/apps/web');
    const others = readdirSync(join(repo, 'packages'))
      .map((name) => `packages/${name}`)
      .filter((path) => existsSync(join(repo, path, 'package.json')) && !packages.includes(path));

    expect(packages).toEqual(expect.arrayContaining(['packages/config', 'packages/design-system']));
    for (const [path, expected] of [
      ...packages.map((path) => [path, true] as const),
      ...others.map((path) => [path, false] as const),
    ]) {
      const base = git('rev-parse', 'HEAD');
      commit(`${path}/src/index.ts`);
      expect(select(base), path).toBe(`blog=${expected}`);
    }
  });

  it.each(['', '0'.repeat(40), 'f'.repeat(40)])(
    '기준 커밋 %j를 읽을 수 없으면 Blog 검증을 선택해야 한다',
    (base) => {
      commit('README.md');
      expect(select(base)).toBe('blog=true');
    },
  );
});
