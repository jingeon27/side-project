import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createS3TestConfig } from '../testing/s3';

const RuleSchema = z.looseObject({
  ID: z.string(),
  Status: z.literal('Enabled'),
  Filter: z.object({ Prefix: z.string() }),
  Expiration: z.object({ Days: z.number().int().positive() }).optional(),
  NoncurrentVersionExpiration: z.object({ NoncurrentDays: z.number().int().positive() }).optional(),
});
const LifecycleSchema = z.object({ Rules: z.array(RuleSchema) });
function lifecycle(path: string) {
  return LifecycleSchema.parse(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));
}
// 두 서비스의 테스트는 문서화한 로컬·CI 폴더의 `tests/<실행 ID>/`에만 쓰므로 이 접두사에는 테스트 객체만 있다.
const TEST_PREFIXES = [
  'game-feedback/ci/tests/',
  'game-feedback/local/tests/',
  'photo-contest/ci/tests/',
  'photo-contest/local/tests/',
];

describe('Game Feedback S3 lifecycle', () => {
  const shared = lifecycle('../../../../../../deploy/shared-instance/s3-lifecycle.json');
  const service = lifecycle('../../../../deploy/shared-instance/s3-lifecycle.json');

  it('keeps every shared bucket rule because put-bucket-lifecycle-configuration replaces the whole set', () => {
    for (const rule of shared.Rules) expect(service.Rules).toContainEqual(rule);
  });

  it('expires abandoned production staging uploads after the daily prune would have removed them', () => {
    // MediaStorage.prepareUpload signs `<GF_S3_KEY_PREFIX>/staging/<uuid>` and prune drops drafts after 24h.
    const staging = service.Rules.find((rule) => rule.Filter.Prefix === 'game-feedback/production/staging/');
    expect(staging?.Expiration?.Days).toBeGreaterThanOrEqual(2);
    // staging과 테스트 실행 폴더 밖의 현재 객체는 만료하지 않는다. 서비스·환경 폴더 전체처럼 넓은 접두사는 실패한다.
    const nonTest = service.Rules.filter(
      (rule) => rule.Expiration && !TEST_PREFIXES.includes(rule.Filter.Prefix),
    );
    for (const rule of nonTest) expect(rule.Filter.Prefix).toMatch(/^game-feedback\/[a-z]+\/staging\/$/);
  });

  it('expires objects that an interrupted CI or local test run leaves under its run prefix', () => {
    for (const keyPrefix of ['game-feedback/ci', 'game-feedback/local']) {
      const run = createS3TestConfig({ GF_S3_BUCKET: 'shared-media', GF_S3_KEY_PREFIX: keyPrefix });
      expect(TEST_PREFIXES.filter((prefix) => `${run.keyPrefix}/`.startsWith(prefix))).toHaveLength(1);
    }
    for (const prefix of TEST_PREFIXES) {
      const rule = shared.Rules.find((candidate) => candidate.Filter.Prefix === prefix);
      expect(rule?.Expiration?.Days, prefix).toBe(2);
      expect(rule?.NoncurrentVersionExpiration?.NoncurrentDays, prefix).toBe(1);
    }
  });
});
