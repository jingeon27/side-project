import { expect, it, vi } from 'vitest';

import { TrophyLearnerClient } from './learner-client.ts';

const transport = vi.hoisted(() => ({
  ready: vi.fn(async () => {}),
  request: vi.fn(),
  close: vi.fn(async () => {}),
}));
vi.mock('../shared/json-lines-client.ts', () => ({
  JsonLineClient: class {
    ready = transport.ready;
    request = transport.request;
    close = transport.close;
  },
}));

it('reads the real worker result envelope and keeps the stored snapshot strict', async () => {
  const snapshot = { checkpoint: '/owned/v0/policy.json', version: 0, weightsSHA256: 'a'.repeat(64) };
  const client = new TrophyLearnerClient('/owned', '/owned/trophy');
  transport.request.mockResolvedValueOnce({ type: 'result', ...snapshot });
  expect(await client.initialize('/seed.json', 'b'.repeat(64))).toEqual(snapshot);
  expect(transport.ready.mock.invocationCallOrder[0]).toBeLessThan(
    transport.request.mock.invocationCallOrder[0] ?? 0,
  );
  const update = { type: 'result', id: 'receipt', snapshot, report: { updated: false } };
  transport.request.mockResolvedValueOnce(update);
  expect(await client.train(snapshot, ['/episode.json'], 'b'.repeat(64), 'a'.repeat(64))).toEqual(update);
  await client.close();
  expect(transport.close).toHaveBeenCalledOnce();
});
