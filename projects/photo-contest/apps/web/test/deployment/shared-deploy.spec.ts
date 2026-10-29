import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url));
const scripts = join(repo, 'deploy/shared-instance/scripts');
const sha = 'a'.repeat(40);
const apiImage = `ghcr.io/jingeon27/side-project-photo-contest-api@sha256:${'b'.repeat(64)}`;
const webImage = `ghcr.io/jingeon27/side-project-photo-contest-web@sha256:${'c'.repeat(64)}`;
const token = 'registry-token-fixture-only';
const serviceEnv = "PC_DATABASE_URL=fixture-new\nENV_SECRET='secret:$literal ${unexpanded} 한글'\n";
const state = {} as { root: string; tools: string };

// 원격 호스트·Docker·SSH만 대역으로 바꾸고 배포 스크립트는 그대로 실행한다.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ -n "\${FAKE_DOCKER_FAIL:-}" && "$*" == *"$FAKE_DOCKER_FAIL"* ]]; then echo "fake docker failure: $*" >&2; exit 1; fi
case "$1" in
  version) echo 27.3.1 ;;
  login) cat >/dev/null; echo 'Login Succeeded' ;;
  inspect)
    if [[ "$*" == *'.State.Status'* ]]; then echo "\${FAKE_WEB_STATE:-running}"; exit 0; fi
    echo 'Web shutdown: exit=0 oom=false' ;;
  network) if [[ "$*" == *--format* ]]; then echo "$SIDE_DEPLOY_ROOT"; fi ;;
  compose)
    if [[ "$*" == *" config --quiet" && -n "\${FAKE_CONFIG_ERROR:-}" ]]; then echo "$FAKE_CONFIG_ERROR" >&2; exit 1; fi
    if [[ "$*" == *" ps -q web" ]]; then echo old-web; fi
    if [[ "$*" == *" pg_dump "* ]]; then printf 'PGDMP fixture'; fi
    if [[ "$*" == *" -T migrate" && -n "\${FAKE_MIGRATE_SECONDS:-}" ]]; then sleep "$FAKE_MIGRATE_SECONDS"; fi ;;
esac
`;
// 고정된 원격 경로를 테스트 루트로 바꿔 같은 기기에서 실행한다. 일부 상태 조회는 연결 실패로 흉내 낸다.
const FAKE_SSH = `#!/usr/bin/env bash
if [[ -n "\${FAKE_SSH_ARGS:-}" ]]; then printf '%s\\n' "$@" >>"$FAKE_SSH_ARGS"; fi
while (($#)); do
  case "$1" in
    -i|-p|-o) shift 2 ;;
    *) break ;;
  esac
done
shift
command=\${*//\\/srv\\/side-project/$FAKE_REMOTE_ROOT}
if [[ "$command" == *job-status.sh* && -n "\${FAKE_SSH_DROPPED_POLLS:-}" ]]; then
  count=$(( $(cat "$FAKE_REMOTE_ROOT/.dropped" 2>/dev/null || echo 0) + 1 ))
  echo "$count" >"$FAKE_REMOTE_ROOT/.dropped"
  if ((count <= FAKE_SSH_DROPPED_POLLS)); then echo 'Connection reset' >&2; exit 255; fi
fi
SIDE_DEPLOY_ROOT=$FAKE_REMOTE_ROOT exec bash -c "$command"
`;
// macOS에도 Linux flock과 같은 커널 파일 잠금을 제공한다.
const FAKE_FLOCK = `#!/usr/bin/env python3
import fcntl, sys
fcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX)
`;

beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'shared-deploy-root-'));
  state.tools = mkdtempSync(join(tmpdir(), 'shared-deploy-tools-'));
  for (const directory of ['database', 'postgres', 'proxy', 'services/photo-contest'])
    mkdirSync(join(state.root, directory), { recursive: true });
  writeFileSync(
    join(state.root, '.env'),
    [
      'GAME_FEEDBACK_DOMAIN=game.example.test',
      'GAME_FEEDBACK_API_DOMAIN=api.game.example.test',
      'PHOTO_CONTEST_DOMAIN=contest.example.test',
      'PHOTO_CONTEST_API_DOMAIN=api.contest.example.test',
      'GAME_FEEDBACK_S3_BUCKET=side-media',
      'PHOTO_CONTEST_S3_BUCKET=side-media',
      'BACKUP_BUCKET=side-db-backup',
      'BACKUP_REGION=ap-northeast-2',
      '',
    ].join('\n'),
  );
  writeFileSync(join(state.root, 'services/photo-contest/.env'), 'DATABASE_URL=fixture\n');
  writeFileSync(join(state.root, 'database/compose.yaml'), 'services: {}\n');
  writeFileSync(join(state.root, 'database/.env'), 'POSTGRES_SUPERUSER_PASSWORD=fixture\n');
  writeFileSync(join(state.root, 'postgres/.side-postgres-volume'), 'volume=vol-fixture\n');
  cpSync(join(repo, 'deploy/shared-instance/Caddyfile'), join(state.root, 'proxy/Caddyfile'));
  cpSync(join(repo, 'deploy/shared-instance/compose.yaml'), join(state.root, 'proxy/compose.yaml'));
  const tools = {
    docker: FAKE_DOCKER,
    ssh: FAKE_SSH,
    flock: FAKE_FLOCK,
    setsid: '#!/bin/sh\nexec "$@"\n',
    aws: '#!/bin/sh\nexit 0\n',
    'session-manager-plugin': '#!/bin/sh\nexit 0\n',
  };
  for (const [name, source] of Object.entries(tools))
    writeFileSync(join(state.tools, name), source, { mode: 0o700 });
});

afterEach(() => {
  rmSync(state.root, { recursive: true, force: true });
  rmSync(state.tools, { recursive: true, force: true });
});

const environment = (extra: Record<string, string> = {}) => ({
  ...process.env,
  PATH: `${state.tools}:${process.env.PATH}`,
  FAKE_REMOTE_ROOT: state.root,
  FAKE_DOCKER_LOG: join(state.root, 'docker.log'),
  SIDE_POSTGRES_ROOT: join(state.root, 'postgres'),
  ...extra,
});
const dockerCalls = () =>
  existsSync(join(state.root, 'docker.log'))
    ? readFileSync(join(state.root, 'docker.log'), 'utf8').trim().split('\n')
    : [];
const releaseDirectory = () => join(state.root, 'services/photo-contest/releases', sha);

function upload(extra: Record<string, string> = {}) {
  return spawnSync('bash', [join(scripts, 'ci-upload.sh'), 'photo-contest'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
    env: environment({
      RELEASE_SHA: sha,
      API_IMAGE: apiImage,
      WEB_IMAGE: webImage,
      REGISTRY_TOKEN: token,
      REGISTRY_USER: 'jingeon27',
      SERVICE_ENV: serviceEnv,
      SERVICE_ENV_OVERRIDES: '',
      DEPLOY_HOST: 'deploy.example.test',
      DEPLOY_USER: 'deploy',
      DEPLOY_SSH_KEY: 'fixture-key',
      DEPLOY_KNOWN_HOSTS: 'deploy.example.test ssh-ed25519 fixture',
      DEPLOY_POLL_SECONDS: '0.2',
      DEPLOY_WAIT_SECONDS: '60',
      ...extra,
    }),
  });
}

/** CI 업로드를 거치지 않고 릴리스 디렉터리만 준비한다. */
function prepareRelease() {
  const directory = releaseDirectory();
  mkdirSync(directory, { recursive: true });
  cpSync(
    join(repo, 'projects/photo-contest/deploy/shared-instance/compose.yaml'),
    join(directory, 'compose.yaml'),
  );
  cpSync(join(repo, 'deploy/shared-instance/Caddyfile'), join(directory, 'Caddyfile'));
  cpSync(scripts, join(directory, 'host'), { recursive: true });
  return directory;
}

function jobStatus(job: string, offset = 0) {
  return spawnSync(
    'bash',
    [join(releaseDirectory(), 'host/job-status.sh'), 'photo-contest', sha, job, String(offset)],
    {
      encoding: 'utf8',
      env: environment({ SIDE_DEPLOY_ROOT: state.root }),
    },
  );
}

describe('공유 호스트 원격 배포', () => {
  it.each(['API_IMAGE', 'WEB_IMAGE'])(
    '%s가 레지스트리 없는 로컬 주소면 SSH 접속 전에 원인을 알려야 한다',
    (setting) => {
      const result = upload({ [setting]: `photo-contest-api@sha256:${'a'.repeat(64)}` });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${setting} must be a fully qualified GHCR digest`);
      expect(existsSync(releaseDirectory())).toBe(false);
      expect(dockerCalls()).toEqual([]);
    },
  );

  it('SERVICE_ENV를 그대로 권한 600으로 반영하고 릴리스·로그·임시 파일에 남기지 않아야 한다', () => {
    const argumentsFile = join(state.root, 'ssh-arguments');
    const result = upload({ FAKE_SSH_ARGS: argumentsFile });
    expect(result.status, result.stderr).toBe(0);
    const environmentFile = join(state.root, 'services/photo-contest/.env');
    expect(readFileSync(environmentFile, 'utf8')).toBe(serviceEnv);
    expect(statSync(environmentFile).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(state.root, 'services/photo-contest/.env-requests'))).toEqual([]);
    expect(
      readdirSync(join(state.root, 'services/photo-contest')).some((name) =>
        name.startsWith('.env-previous-'),
      ),
    ).toBe(false);
    const files = readdirSync(releaseDirectory(), { recursive: true }).map(String);
    for (const file of files) {
      const path = join(releaseDirectory(), file);
      if (statSync(path).isFile()) expect(readFileSync(path, 'utf8')).not.toContain('secret:$literal');
    }
    expect(`${result.stdout}${result.stderr}${readFileSync(argumentsFile, 'utf8')}`).not.toContain(
      'secret:$literal',
    );
  }, 60_000);

  it.each(['', ' \n\t'])('빈 SERVICE_ENV는 원격 업로드 전에 거부해야 한다', (value) => {
    const result = upload({ SERVICE_ENV: value });
    expect(result.status).not.toBe(0);
    expect(existsSync(releaseDirectory())).toBe(false);
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      'DATABASE_URL=fixture\n',
    );
  });

  it('추가 Secret은 기존 DB 설정을 보존하며 합치고 로그와 릴리스에 남기지 않아야 한다', () => {
    const overrides =
      "PC_SENTRY_DSN='https://public@sentry.example/1'\nGOOGLE_CLIENT_SECRET='oauth-secret:$literal'\n";
    const argumentsFile = join(state.root, 'ssh-arguments');
    const result = upload({ SERVICE_ENV_OVERRIDES: overrides, FAKE_SSH_ARGS: argumentsFile });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      `${serviceEnv}\n${overrides}`,
    );
    expect(`${result.stdout}${result.stderr}${readFileSync(argumentsFile, 'utf8')}`).not.toContain(
      'oauth-secret',
    );
    for (const file of readdirSync(releaseDirectory(), { recursive: true }).map(String)) {
      const path = join(releaseDirectory(), file);
      if (statSync(path).isFile()) expect(readFileSync(path, 'utf8')).not.toContain('oauth-secret');
    }
  }, 60_000);

  it('추가 Secret만으로 빈 운영 환경 파일을 대신하지 못해야 한다', () => {
    const result = upload({ SERVICE_ENV: '', SERVICE_ENV_OVERRIDES: 'PC_SENTRY_DSN=fixture' });
    expect(result.status).not.toBe(0);
    expect(existsSync(releaseDirectory())).toBe(false);
  });

  it('Compose 설정 오류에 Secret이 포함돼도 출력하지 않고 기존 환경을 보존해야 한다', () => {
    const result = upload({ FAKE_CONFIG_ERROR: serviceEnv });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('configuration is invalid');
    expect(`${result.stdout}${result.stderr}`).not.toContain('secret:$literal');
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      'DATABASE_URL=fixture\n',
    );
    expect(readdirSync(join(state.root, 'services/photo-contest/.env-requests'))).toEqual([]);
    expect(dockerCalls().some((call) => call.includes('-T migrate'))).toBe(false);
  }, 60_000);

  it('끊긴 Secret 전송은 적용하지 않고 수신 임시 파일을 지워야 한다', () => {
    prepareRelease();
    const result = spawnSync(
      'bash',
      [join(releaseDirectory(), 'host/receive.sh'), 'photo-contest', sha, apiImage, webImage, 'jingeon27'],
      {
        encoding: 'utf8',
        env: environment({ SIDE_DEPLOY_ROOT: state.root }),
        input: `${token}\n${Buffer.byteLength(serviceEnv) + 10}\n${serviceEnv}`,
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Incomplete SERVICE_ENV transfer');
    expect(`${result.stdout}${result.stderr}`).not.toContain('secret:$literal');
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      'DATABASE_URL=fixture\n',
    );
    expect(readdirSync(join(state.root, 'services/photo-contest/.env-requests'))).toEqual([]);
    expect(dockerCalls()).toEqual([]);
  });

  it('새 앱 교체에 실패하면 이전 환경을 복원한 뒤 이전 이미지를 다시 실행해야 한다', () => {
    const previous = join(state.root, 'services/photo-contest/releases', 'd'.repeat(40));
    mkdirSync(previous, { recursive: true });
    cpSync(
      join(repo, 'projects/photo-contest/deploy/shared-instance/compose.yaml'),
      join(previous, 'compose.yaml'),
    );
    symlinkSync(previous, join(state.root, 'services/photo-contest/current'));
    const result = upload({ FAKE_DOCKER_FAIL: `${sha}/compose.yaml up -d` });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Previous application images restored');
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      'DATABASE_URL=fixture\n',
    );
    expect(readlinkSync(join(state.root, 'services/photo-contest/current'))).toBe(previous);
    expect(dockerCalls().some((call) => call.includes(`${previous}/compose.yaml up -d`))).toBe(true);
    expect(readdirSync(join(state.root, 'services/photo-contest/.env-requests'))).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).not.toContain('secret:$literal');
  }, 60_000);

  it('SSM 터널에서도 호스트 키를 검사하고 같은 원격 배포를 끝까지 따라가야 한다', () => {
    const argumentsFile = join(state.root, 'ssh-arguments');
    const result = upload({
      DEPLOY_SSM_INSTANCE_ID: 'i-0123456789abcdef0',
      DEPLOY_AWS_REGION: 'ap-northeast-2',
      FAKE_SSH_ARGS: argumentsFile,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readlinkSync(join(state.root, 'services/photo-contest/current'))).toBe(releaseDirectory());
    const argumentsText = readFileSync(argumentsFile, 'utf8');
    expect(argumentsText).toContain('StrictHostKeyChecking=yes');
    expect(argumentsText).toContain('UserKnownHostsFile=');
    expect(argumentsText).toContain(
      'ProxyCommand=aws ssm start-session --region ap-northeast-2 --target i-0123456789abcdef0 --document-name AWS-StartSSHSession --parameters portNumber=%p',
    );
    expect(`${result.stdout}${result.stderr}${argumentsText}`).not.toContain(token);
  }, 60_000);

  it.each([
    { DEPLOY_SSM_INSTANCE_ID: 'i-0123456789abcdef0;touch injected', DEPLOY_AWS_REGION: 'ap-northeast-2' },
    { DEPLOY_SSM_INSTANCE_ID: 'i-0123456789abcdef0', DEPLOY_AWS_REGION: 'ap-northeast-2;touch injected' },
    { DEPLOY_SSM_INSTANCE_ID: 'i-0123456789abcdef0', DEPLOY_AWS_REGION: '' },
  ])('잘못된 SSM 연결 값은 SSH 접속 전에 거부해야 한다: %j', (settings) => {
    const result = upload(settings);
    expect(result.status).not.toBe(0);
    expect(existsSync(releaseDirectory())).toBe(false);
    expect(dockerCalls()).toEqual([]);
  });

  it('SSH 세션과 분리한 원격 배포를 끝까지 따라가 성공을 보고해야 한다', () => {
    const result = upload({ FAKE_SSH_DROPPED_POLLS: '2' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Deployment complete: photo-contest');
    expect(readlinkSync(join(state.root, 'services/photo-contest/current'))).toBe(releaseDirectory());
    const calls = dockerCalls();
    const index = (pattern: string) => calls.findIndex((call) => call.includes(pattern));
    expect(index('login ghcr.io')).toBeGreaterThanOrEqual(0);
    expect(index(`pull --quiet ${apiImage}`)).toBeGreaterThan(index('login ghcr.io'));
    expect(index('-T migrate')).toBeGreaterThan(index(`pull --quiet ${webImage}`));
    // 실행 계정 검사 → 덤프 → 백업 버킷 업로드가 끝나야 DDL 계정이 migration을 시작한다.
    expect(index('pg_dump')).toBeGreaterThan(index('scripts/verify-services.ts'));
    expect(index(' s3 cp ')).toBeGreaterThan(index('pg_dump'));
    expect(index('-T migrate')).toBeGreaterThan(index(' s3 cp '));
    expect(existsSync(join(releaseDirectory(), 'pg-backup.json'))).toBe(true);
    expect(index('side-web-draining')).toBeGreaterThan(index('-T migrate'));
    expect(index(' stop web')).toBeGreaterThan(index('side-web-draining'));
    // 분리된 작업은 레지스트리를 다시 부르지 않고 미리 받은 digest만 쓴다.
    expect(calls.filter((call) => call.startsWith('compose') && call.includes(' pull '))).toEqual([]);
    const job = readFileSync(join(state.root, 'services/photo-contest/.deploy-request'), 'utf8').trim();
    expect(job).toMatch(/^run-[A-Za-z0-9]{8}$/);
    expect(readFileSync(join(releaseDirectory(), '.deploy', job, 'status'), 'utf8').trim()).toBe('0');
    expect(`${result.stdout}${result.stderr}`).not.toContain(token);
    expect(readFileSync(join(releaseDirectory(), '.deploy', job, 'log'), 'utf8')).not.toContain(token);
  }, 60_000);

  it('원격 배포가 실패하면 CI도 실패로 끝나고 current를 바꾸지 않아야 한다', () => {
    const result = upload({ FAKE_DOCKER_FAIL: '-T migrate' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('fake docker failure');
    expect(result.stderr).toContain('failed');
    expect(existsSync(join(state.root, 'services/photo-contest/current'))).toBe(false);
    expect(readFileSync(join(state.root, 'services/photo-contest/.env'), 'utf8')).toBe(
      'DATABASE_URL=fixture\n',
    );
    expect(readdirSync(join(state.root, 'services/photo-contest/.env-requests'))).toEqual([]);
  }, 60_000);

  it('백업 업로드가 실패하면 migration과 교체 전에 배포를 멈춰야 한다', () => {
    const result = upload({ FAKE_DOCKER_FAIL: ' s3 cp ' });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('fake docker failure');
    expect(dockerCalls().some((call) => call.includes('-T migrate') || call.includes(' stop web'))).toBe(
      false,
    );
    expect(existsSync(join(state.root, 'services/photo-contest/current'))).toBe(false);
  }, 60_000);

  it.each([
    ['restarting', true],
    ['exited', true],
    ['running', false],
  ])(
    '종료 대기 표시를 쓸 수 없는 %s 웹은 실행 상태에 따라 교체 여부를 결정해야 한다',
    (status, replace) => {
      const result = upload({ FAKE_DOCKER_FAIL: 'side-web-draining', FAKE_WEB_STATE: status });
      expect(result.status === 0, result.stderr).toBe(replace);
      expect(dockerCalls().some((call) => call.includes(' stop web'))).toBe(replace);
      expect(existsSync(join(state.root, 'services/photo-contest/current'))).toBe(replace);
      if (replace) expect(result.stdout).toContain(`Skipping drain for non-running web container: ${status}`);
    },
    60_000,
  );

  it('호스트 Caddyfile이 릴리스와 다르면 검사·마이그레이션 전에 배포를 거부해야 한다', () => {
    writeFileSync(join(state.root, 'proxy/Caddyfile'), '# drifted\n');
    const result = upload();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('proxy Caddyfile differs');
    expect(result.stdout).toContain(`proxy.sh sync ${join(releaseDirectory(), 'Caddyfile')}`);
    expect(dockerCalls().some((call) => call.includes(' ops ') || call.includes('-T migrate'))).toBe(false);
  }, 60_000);

  it.each([
    ['검증을 통과하면 같은 파일을 덮어쓰고 다시 읽혀야', '', true],
    ['검증에 실패하면 이전 파일을 되돌리고 다시 읽지 않아야', 'caddy validate', false],
  ])('proxy.sh sync는 %s 한다', (_, failure, applied) => {
    const release = prepareRelease();
    const proxy = join(state.root, 'proxy/Caddyfile');
    writeFileSync(proxy, '# previous\n');
    const result = spawnSync('bash', [join(release, 'host/proxy.sh'), 'sync', join(release, 'Caddyfile')], {
      encoding: 'utf8',
      env: environment({ SIDE_DEPLOY_ROOT: state.root, FAKE_DOCKER_FAIL: failure }),
    });
    expect(result.status === 0, result.stderr).toBe(applied);
    expect(readFileSync(proxy, 'utf8')).toBe(
      applied ? readFileSync(join(release, 'Caddyfile'), 'utf8') : '# previous\n',
    );
    expect(dockerCalls().some((call) => call.includes('caddy reload'))).toBe(applied);
  });

  it('SSH 세션이 끝난 뒤에도 분리된 작업이 배포를 마쳐야 한다', async () => {
    prepareRelease();
    const receive = spawn(
      'bash',
      [join(releaseDirectory(), 'host/receive.sh'), 'photo-contest', sha, apiImage, webImage, 'jingeon27'],
      { env: environment({ SIDE_DEPLOY_ROOT: state.root, FAKE_MIGRATE_SECONDS: '2' }) },
    );
    let output = '';
    receive.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    receive.stdin.end(`${token}\n${Buffer.byteLength(serviceEnv)}\n${serviceEnv}`);
    const [code] = await once(receive, 'close');
    expect(code).toBe(0);
    const job = output.trim();
    expect(job).toMatch(/^run-[A-Za-z0-9]{8}$/);
    expect(jobStatus(job).status).toBe(3);
    let result = jobStatus(job);
    for (let attempt = 0; attempt < 100 && result.status === 3; attempt += 1) {
      await delay(200);
      result = jobStatus(job);
    }
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Deployment complete: photo-contest');
    expect(jobStatus(job, Buffer.byteLength(result.stdout)).stdout).toBe('');
  }, 60_000);

  it('더 새 배포 요청이 있으면 오래된 작업은 아무것도 바꾸지 않아야 한다', () => {
    prepareRelease();
    writeFileSync(join(state.root, 'services/photo-contest/.deploy-request'), 'run-newer123\n');
    const result = spawnSync(
      'bash',
      [join(releaseDirectory(), 'host/service.sh'), 'photo-contest', 'deploy', sha, apiImage, webImage],
      {
        encoding: 'utf8',
        env: environment({ SIDE_DEPLOY_ROOT: state.root, SIDE_DEPLOY_REQUEST: 'run-older123' }),
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('newer deployment request');
    expect(dockerCalls().filter((call) => call.startsWith('compose'))).toEqual([]);
    expect(existsSync(join(releaseDirectory(), '.release.env'))).toBe(false);
  });

  it('상태를 남기지 않고 멈춘 작업은 실패로 보고해야 한다', async () => {
    const job = join(prepareRelease(), '.deploy/run-stopped1');
    mkdirSync(job, { recursive: true });
    writeFileSync(join(job, 'log'), 'Deployment run-stopped1 started\n');
    const finished = spawn('true');
    await once(finished, 'exit');
    writeFileSync(join(job, 'pid'), `${finished.pid}\n`);
    const result = jobStatus('run-stopped1');
    expect(result.status).toBe(4);
    expect(result.stdout).toContain('started');
    expect(result.stderr).toContain('without recording a status');
  });
});
