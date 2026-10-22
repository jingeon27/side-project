import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
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
const state = {} as { root: string; tools: string };

// 원격 호스트·Docker·SSH만 대역으로 바꾸고 배포 스크립트는 그대로 실행한다.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
if [[ -n "\${FAKE_DOCKER_FAIL:-}" && "$*" == *"$FAKE_DOCKER_FAIL"* ]]; then echo "fake docker failure: $*" >&2; exit 1; fi
case "$1" in
  version) echo 27.3.1 ;;
  login) cat >/dev/null; echo 'Login Succeeded' ;;
  inspect) echo 'Web shutdown: exit=0 oom=false' ;;
  network) if [[ "$*" == *--format* ]]; then echo "$SIDE_DEPLOY_ROOT"; fi ;;
  run)
    printf '{"DBInstances":[{"Engine":"postgres","Endpoint":{"Address":"shared.abcdef.ap-northeast-2.rds.amazonaws.com"},"BackupRetentionPeriod":7,"StorageEncrypted":true,"PubliclyAccessible":false,"DeletionProtection":true,"LatestRestorableTime":"%s","DBInstanceArn":"arn:aws:rds:ap-northeast-2:123456789012:db:shared"}]}\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" ;;
  compose)
    if [[ "$*" == *" ps -aq web" ]]; then echo old-web; fi
    if [[ "$*" == *" -T migrate" && -n "\${FAKE_MIGRATE_SECONDS:-}" ]]; then sleep "$FAKE_MIGRATE_SECONDS"; fi ;;
esac
`;
// 고정된 원격 경로를 테스트 루트로 바꿔 같은 기기에서 실행한다. 일부 상태 조회는 연결 실패로 흉내 낸다.
const FAKE_SSH = `#!/usr/bin/env bash
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
  for (const directory of ['certs', 'proxy', 'services/photo-contest'])
    mkdirSync(join(state.root, directory), { recursive: true });
  writeFileSync(
    join(state.root, '.env'),
    [
      'GAME_FEEDBACK_DOMAIN=game.example.test',
      'GAME_FEEDBACK_API_DOMAIN=api.game.example.test',
      'PHOTO_CONTEST_DOMAIN=contest.example.test',
      'PHOTO_CONTEST_API_DOMAIN=api.contest.example.test',
      'GAME_FEEDBACK_S3_BUCKET=gf-private',
      'PHOTO_CONTEST_S3_BUCKET=pc-private',
      'RDS_REGION=ap-northeast-2',
      'RDS_INSTANCE_ID=shared',
      'RDS_HOST=shared.abcdef.ap-northeast-2.rds.amazonaws.com',
      '',
    ].join('\n'),
  );
  writeFileSync(join(state.root, 'services/photo-contest/.env'), 'DATABASE_URL=fixture\n');
  writeFileSync(join(state.root, 'certs/rds-ca.pem'), 'fixture\n');
  cpSync(join(repo, 'deploy/shared-instance/Caddyfile'), join(state.root, 'proxy/Caddyfile'));
  cpSync(join(repo, 'deploy/shared-instance/compose.yaml'), join(state.root, 'proxy/compose.yaml'));
  const tools = { docker: FAKE_DOCKER, ssh: FAKE_SSH, flock: FAKE_FLOCK, setsid: '#!/bin/sh\nexec "$@"\n' };
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
  }, 60_000);

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
    receive.stdin.end(`${token}\n`);
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
