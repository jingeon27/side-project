import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { DATA_DIR } from '../../shared/config.ts';
import { CounterpushVisionClient } from './vision-client.ts';

it.skipIf(process.env.RUN_COUNTERPUSH_INTEGRATION !== '1')(
  'launches the packaged Python detector and scans a recorded frame over JSON lines',
  async () => {
    const client = new CounterpushVisionClient(DATA_DIR);
    try {
      await client.ready();
      const frame = fileURLToPath(
        new URL('../../../test-fixtures/counterpush/unit-badges.png', import.meta.url),
      );
      const result = await client.scan(frame);
      expect(result.entities.length + result.allies.length).toBeGreaterThan(0);
      expect(result.elapsed_ms).toBeGreaterThan(0);
    } finally {
      client.close();
    }
  },
  60_000,
);
