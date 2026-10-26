import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../../../deploy/shared-instance/scripts/pg-backup.sh', import.meta.url),
);
const sha = 'a'.repeat(40);
const archive = 'PGDMP fixture archive';
const state = {} as { root: string; data: string; tools: string };
// pg_dump(compose exec)와 S3 업로드(aws-cli 컨테이너)만 대역으로 바꾸고 스크립트는 그대로 실행한다.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >>"$FAKE_DOCKER_LOG"
case "$1" in
  compose) printf '%s' "\${FAKE_DUMP-${archive}}" ;;
  run)
    printf '%s\\n' "$@" >"$FAKE_DOCKER_LOG.run"
    if [[ -n "\${FAKE_UPLOAD_FAIL:-}" ]]; then echo 'upload denied' >&2; exit 1; fi ;;
esac
`;

beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'pg-backup-root-'));
  state.data = mkdtempSync(join(tmpdir(), 'pg-backup-data-'));
  state.tools = mkdtempSync(join(tmpdir(), 'pg-backup-tools-'));
  mkdirSync(join(state.root, 'database'));
  writeFileSync(
    join(state.root, '.env'),
    [
      'GAME_FEEDBACK_S3_BUCKET=gf-private',
      'PHOTO_CONTEST_S3_BUCKET=pc-private',
      'BACKUP_BUCKET=side-db-backup',
      'BACKUP_REGION=ap-northeast-2',
      '',
    ].join('\n'),
  );
  writeFileSync(join(state.root, 'database/compose.yaml'), 'services: {}\n');
  writeFileSync(join(state.root, 'database/.env'), 'POSTGRES_SUPERUSER_PASSWORD=fixture\n');
  writeFileSync(join(state.data, '.side-postgres-volume'), 'volume=vol-fixture\n');
  writeFileSync(join(state.tools, 'docker'), FAKE_DOCKER, { mode: 0o700 });
});

afterEach(() => {
  for (const directory of [state.root, state.data, state.tools])
    rmSync(directory, { recursive: true, force: true });
});

const receipt = () => join(state.root, 'pg-backup.json');
const dumps = () => join(state.data, 'dumps/photo-contest');
const dockerCalls = () =>
  existsSync(join(state.root, 'docker.log'))
    ? readFileSync(join(state.root, 'docker.log'), 'utf8').trim().split('\n')
    : [];
const execute = (extra: Record<string, string> = {}, service = 'photo-contest') =>
  spawnSync('bash', [script, service, sha, receipt()], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${state.tools}:${process.env.PATH}`,
      SIDE_DEPLOY_ROOT: state.root,
      SIDE_POSTGRES_ROOT: state.data,
      FAKE_DOCKER_LOG: join(state.root, 'docker.log'),
      ...extra,
    },
  });

describe('배포 전 PostgreSQL 덤프', () => {
  it('서비스 DB를 덤프해 백업 버킷에 올리고 영수증을 남겨야 한다', () => {
    const result = execute();
    expect(result.status, result.stderr).toBe(0);
    const [name] = readdirSync(dumps());
    expect(name).toMatch(new RegExp(`^\\d{8}T\\d{6}Z-${sha}\\.dump$`));
    expect(readFileSync(join(dumps(), name ?? ''), 'utf8')).toBe(archive);
    expect(JSON.parse(readFileSync(receipt(), 'utf8'))).toMatchObject({
      object: `s3://side-db-backup/postgres/photo-contest/${name}`,
      bytes: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    });
    expect(dockerCalls()[0]).toContain(
      'exec -T postgres pg_dump --username postgres --dbname photo_contest --format custom',
    );
    expect(result.stdout).toContain('not a restore drill');
  });

  it('aws-cli는 고정 이미지를 host 네트워크에서 권한 없이 실행하고 덤프만 읽기 전용으로 받아야 한다', () => {
    expect(execute().status).toBe(0);
    const [name] = readdirSync(dumps());
    const args = readFileSync(join(state.root, 'docker.log.run'), 'utf8').trim().split('\n');
    expect(args.slice(0, 8)).toEqual([
      'run',
      '--rm',
      '--network',
      'host',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
    ]);
    expect(args).toContain(`${join(dumps(), name ?? '')}:/backup/${name}:ro`);
    const image = args.findIndex((arg) => arg.startsWith('amazon/aws-cli'));
    expect(args[image]).toMatch(/^amazon\/aws-cli:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
    expect(args.slice(image + 1, image + 5)).toEqual([
      's3',
      'cp',
      `/backup/${name}`,
      `s3://side-db-backup/postgres/photo-contest/${name}`,
    ]);
  });

  it.each([
    ['볼륨이 마운트되지 않았으면', () => rmSync(join(state.data, '.side-postgres-volume')), 'not mounted'],
    [
      '백업 버킷이 없으면',
      () => writeFileSync(join(state.root, '.env'), 'PHOTO_CONTEST_S3_BUCKET=pc-private\n'),
      'BACKUP_BUCKET',
    ],
    [
      '백업 버킷이 서비스 버킷과 같으면',
      () =>
        writeFileSync(
          join(state.root, '.env'),
          'PHOTO_CONTEST_S3_BUCKET=pc-private\nBACKUP_BUCKET=pc-private\nBACKUP_REGION=ap-northeast-2\n',
        ),
      'BACKUP_BUCKET',
    ],
  ])('%s 덤프 전에 멈춰야 한다', (_, prepare, message) => {
    prepare();
    const result = execute();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(dockerCalls()).toEqual([]);
    expect(existsSync(receipt())).toBe(false);
  });

  it('공용 배포 대상이 아닌 서비스 이름은 거부해야 한다', () => {
    expect(execute({}, 'blog').status).not.toBe(0);
    expect(dockerCalls()).toEqual([]);
  });

  it('pg_dump가 아카이브를 만들지 못하면 업로드하지 않고 부분 파일도 남기지 않아야 한다', () => {
    const result = execute({ FAKE_DUMP: '' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('custom-format archive');
    expect(dockerCalls().some((call) => call.startsWith('run'))).toBe(false);
    expect(readdirSync(dumps())).toEqual([]);
  });

  it('업로드가 실패하면 실패로 끝나고 영수증 없이 로컬 덤프만 남겨야 한다', () => {
    const result = execute({ FAKE_UPLOAD_FAIL: '1' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('upload denied');
    expect(existsSync(receipt())).toBe(false);
    expect(readdirSync(dumps())).toHaveLength(1);
  });
});
