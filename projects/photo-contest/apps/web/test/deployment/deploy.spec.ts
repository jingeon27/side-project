import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
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
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/docker.ts', import.meta.url));
const oldRevision = 'a'.repeat(40);
const newRevision = 'b'.repeat(40);
const apiImage = `ghcr.io/owner/side-photo-contest-api@sha256:${'c'.repeat(64)}`;
const webImage = `ghcr.io/owner/side-photo-contest-web@sha256:${'d'.repeat(64)}`;
let root: string;

function run(script: string, args: string[] = [], failure = '') {
  return spawnSync('bash', [join(projectRoot, 'deploy/scripts', script), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      NODE_BIN: process.execPath,
      DOCKER_FIXTURE: fixture,
      PHOTO_CONTEST_DEPLOY_ROOT: root,
      DEPLOY_FAKE_STATE: `${root}/state.json`,
      DEPLOY_FAKE_BROKEN: newRevision,
      DEPLOY_FAKE_FAILURE: failure,
    },
  });
}

function state(): { active: string; migrated: string[] } {
  return JSON.parse(readFileSync(`${root}/state.json`, 'utf8'));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'photo-contest-deploy-'));
  mkdirSync(`${root}/bin`);
  mkdirSync(`${root}/media`);
  writeFileSync(`${root}/media/keep.txt`, '보존할 사진');
  writeFileSync(
    `${root}/.env`,
    `DOMAIN=unit.example\nWEB_ORIGIN=https://unit.example\nACME_EMAIL=unit@example.com\nPOSTGRES_PASSWORD=${'f'.repeat(64)}\nSTORAGE_BACKEND=local\nAWS_SECRET_ACCESS_KEY=private_fixture_only\n`,
    { mode: 0o600 },
  );
  writeFileSync(`${root}/state.json`, JSON.stringify({ active: oldRevision, migrated: [] }));
  for (const revision of [oldRevision, newRevision]) {
    const directory = `${root}/releases/${revision}`;
    mkdirSync(directory, { recursive: true });
    copyFileSync(join(projectRoot, 'deploy/compose.yaml'), `${directory}/compose.yaml`);
    writeFileSync(
      `${directory}/.release.env`,
      `RELEASE_SHA=${revision}\nAPI_IMAGE=${apiImage}\nWEB_IMAGE=${webImage}\n`,
    );
  }
  symlinkSync(`${root}/releases/${oldRevision}`, `${root}/current`);
  for (const tool of ['docker', 'curl', 'sleep'])
    writeFileSync(
      `${root}/bin/${tool}`,
      `#!/bin/sh\nexport DEPLOY_FAKE_TOOL=${tool}\nexec "$NODE_BIN" "$DOCKER_FIXTURE" "$@"\n`,
      { mode: 0o700 },
    );
  // macOS에도 VM의 flock과 같은 커널 파일 잠금을 제공한다.
  writeFileSync(
    `${root}/bin/flock`,
    '#!/usr/bin/env python3\nimport fcntl,sys\ntry:\n fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:\n sys.exit(1)\n',
    { mode: 0o700 },
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('VM 배포', () => {
  it('백업과 마이그레이션·헬스 체크 뒤 릴리스를 바꾸고 원본 파일·비밀 설정을 보존해야 한다', () => {
    const original = readFileSync(`${root}/.env`, 'utf8');
    const result = run('deploy.sh', [newRevision, apiImage, webImage]);
    expect(result.status, result.stderr).toBe(0);
    expect(readlinkSync(`${root}/current`)).toBe(`${root}/releases/${newRevision}`);
    expect(readlinkSync(`${root}/previous`)).toBe(`${root}/releases/${oldRevision}`);
    expect(state()).toEqual({ active: newRevision, migrated: [newRevision] });
    const [backupName] = readdirSync(`${root}/backups`);
    if (!backupName) throw new Error('배포 전 백업이 있어야 한다');
    const backup = join(root, 'backups', backupName);
    expect(readFileSync(`${backup}/database.dump`, 'utf8')).toContain('PGDMP');
    expect(statSync(`${backup}/database.dump`).mode & 0o777).toBe(0o600);
    expect(readFileSync(`${root}/media/keep.txt`, 'utf8')).toBe('보존할 사진');
    expect(readFileSync(`${root}/.env`, 'utf8')).toBe(original);
    expect(`${result.stdout}${result.stderr}`).not.toContain('private_fixture_only');
  });

  it.each(['pull', 'backup', 'migrate'])('%s 실패 시 기존 앱·릴리스를 유지해야 한다', (phase) => {
    const result = run('deploy.sh', [newRevision, apiImage, webImage], phase);
    expect(result.status).not.toBe(0);
    expect(state().active).toBe(oldRevision);
    expect(readlinkSync(`${root}/current`)).toBe(`${root}/releases/${oldRevision}`);
    expect(readFileSync(`${root}/media/keep.txt`, 'utf8')).toBe('보존할 사진');
  });

  it.each(['activate', 'health'])(
    '%s 실패 시 이전 앱으로 복구하고 DB를 자동으로 되돌리지 않아야 한다',
    (phase) => {
      const result = run('deploy.sh', [newRevision, apiImage, webImage], phase);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('이전 앱 이미지로 복구');
      expect(state()).toEqual({ active: oldRevision, migrated: [newRevision] });
      expect(readlinkSync(`${root}/current`)).toBe(`${root}/releases/${oldRevision}`);
    },
    15_000,
  );

  it('태그만 지정한 이미지와 경로를 벗어나는 릴리스는 실행하지 않아야 한다', () => {
    expect(run('deploy.sh', [newRevision, 'ghcr.io/owner/app:latest', webImage]).status).not.toBe(0);
    expect(run('deploy.sh', ['../outside', apiImage, webImage]).status).not.toBe(0);
    expect(state()).toEqual({ active: oldRevision, migrated: [] });
  });

  it('수동 복구는 앱만 바꾸고 기존 DB·파일을 보존해야 한다', () => {
    expect(run('deploy.sh', [newRevision, apiImage, webImage]).status).toBe(0);
    const result = run('rollback.sh');
    expect(result.status, result.stderr).toBe(0);
    expect(readlinkSync(`${root}/current`)).toBe(`${root}/releases/${oldRevision}`);
    expect(state()).toEqual({ active: oldRevision, migrated: [newRevision] });
    expect(readFileSync(`${root}/media/keep.txt`, 'utf8')).toBe('보존할 사진');
  });

  it.each(['stop', 'media'])('로컬 백업의 %s 실패 뒤에도 API를 다시 실행해야 한다', (phase) => {
    const result = run('backup.sh', ['--with-media'], phase);
    expect(result.status).not.toBe(0);
    expect(state().active).toBe(oldRevision);
    expect(result.stdout).not.toContain('백업 완료');
    expect(readFileSync(`${root}/media/keep.txt`, 'utf8')).toBe('보존할 사진');
  });

  it('로컬 미디어를 함께 백업한 뒤 API를 다시 실행하고 원본을 유지해야 한다', () => {
    const result = run('backup.sh', ['--with-media']);
    expect(result.status, result.stderr).toBe(0);
    expect(state().active).toBe(oldRevision);
    const [name] = readdirSync(`${root}/backups`);
    if (!name) throw new Error('백업이 있어야 한다');
    expect(readdirSync(`${root}/backups/${name}`)).toEqual(
      expect.arrayContaining(['database.dump', 'database.sha256', 'media.tar.gz', 'media.sha256']),
    );
    expect(readFileSync(`${root}/media/keep.txt`, 'utf8')).toBe('보존할 사진');
  });

  it('다른 작업이 잠금을 잡고 있으면 배포를 시작하지 않아야 한다', async () => {
    const holder = spawn('python3', [
      '-c',
      'import fcntl,sys; f=open(sys.argv[1],"w"); fcntl.flock(f,fcntl.LOCK_EX); print("locked",flush=True); sys.stdin.read()',
      `${root}/.deploy.lock`,
    ]);
    try {
      await once(holder.stdout, 'data');
      const result = run('deploy.sh', [newRevision, apiImage, webImage]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('다른 배포·백업·복구 작업');
      expect(state()).toEqual({ active: oldRevision, migrated: [] });
    } finally {
      holder.stdin.end();
      await once(holder, 'exit');
    }
  });
});
