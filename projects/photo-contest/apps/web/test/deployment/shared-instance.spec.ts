import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../../../../../deploy/shared-instance/scripts/rds-receipt.py', import.meta.url),
);
const state = {} as { root: string };
const valid = () => ({
  DBInstances: [
    {
      Engine: 'postgres',
      Endpoint: { Address: 'shared.abcdef.ap-northeast-2.rds.amazonaws.com' },
      BackupRetentionPeriod: 7,
      StorageEncrypted: true,
      DeletionProtection: true,
      PubliclyAccessible: false,
      LatestRestorableTime: new Date().toISOString(),
      DBInstanceArn: 'arn:aws:rds:ap-northeast-2:123456789012:db:shared',
    },
  ],
});
beforeEach(() => {
  state.root = mkdtempSync(join(tmpdir(), 'shared-instance-pitr-'));
  mkdirSync(join(state.root, 'bin'));
  writeFileSync(
    join(state.root, '.env'),
    'RDS_REGION=ap-northeast-2\nRDS_INSTANCE_ID=shared\nRDS_HOST=shared.abcdef.ap-northeast-2.rds.amazonaws.com\n',
  );
  writeFileSync(join(state.root, 'bin/docker'), '#!/bin/sh\ncat "$PITR_FIXTURE"\n', { mode: 0o700 });
});
afterEach(() => rmSync(state.root, { recursive: true, force: true }));
const execute = (response: ReturnType<typeof valid>) => {
  writeFileSync(join(state.root, 'response.json'), JSON.stringify(response));
  return spawnSync('python3', [script, state.root, join(state.root, 'receipt.json')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${state.root}/bin:${process.env.PATH}`,
      PITR_FIXTURE: join(state.root, 'response.json'),
    },
  });
};
describe('RDS 공급자 복구 지점 검증', () => {
  it('신선한 PITR과 보호 설정을 확인한 뒤 복구 지점을 기록해야 한다', () => {
    const response = valid();
    const result = execute(response);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(state.root, 'receipt.json'), 'utf8'))).toMatchObject({
      retentionDays: 7,
      instanceArn: response.DBInstances[0]?.DBInstanceArn,
    });
    expect(result.stdout).toContain('not a database restore drill');
  });
  it.each([
    { BackupRetentionPeriod: 1 },
    { PubliclyAccessible: true },
    { DeletionProtection: false },
    { StorageEncrypted: false },
    { Engine: 'mysql' },
    { LatestRestorableTime: '2000-01-01T00:00:00Z' },
    { Endpoint: { Address: 'another.rds.amazonaws.com' } },
    { LatestRestorableTime: '' },
    { LatestRestorableTime: 'invalid' },
    { LatestRestorableTime: '2026-10-19T10:00:00' },
  ])('%j이면 migration 전에 배포를 중단해야 한다', (override) => {
    const response = valid();
    Object.assign(response.DBInstances[0] ?? {}, override);
    const result = execute(response);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RDS must use');
  });
});
