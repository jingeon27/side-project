import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const RuleSchema = z.looseObject({
  ID: z.string(),
  Status: z.literal('Enabled'),
  Filter: z.object({ Prefix: z.string() }),
  Expiration: z.object({ Days: z.number().int().positive() }).optional(),
});
const LifecycleSchema = z.object({ Rules: z.array(RuleSchema) });
function lifecycle(path: string) {
  return LifecycleSchema.parse(JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')));
}

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
    // Current objects outside staging must never expire.
    for (const rule of service.Rules.filter((candidate) => candidate.Expiration))
      expect(rule.Filter.Prefix).toMatch(/^game-feedback\/[a-z]+\/staging\/$/);
  });
});
