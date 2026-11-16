import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import type { LearningDecisionRequest } from '../learning-client.ts';
import { SharedInferenceClient, startSharedInference } from './shared-inference.ts';

it('shares only inference, rejects busy/evaluation work and confines writes to trophy runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clash-shared-'));
  const run = join(root, 'trophy/runs/game');
  const checkpoint = join(root, 'arena/qwen/training/private/checkpoints/v000001');
  await mkdir(run, { recursive: true });
  await mkdir(checkpoint, { recursive: true });
  await writeFile(join(run, '0001.png'), 'test image');
  const state = { available: true, pending: 0 };
  const chooseExternal = vi.fn(async () => ({
    text: '{"choice":0}',
    elapsedMs: 1,
    peakGb: 0,
    behavior: { trainable: false },
  }));
  const policy = { checkpoint, version: 1, weightsSHA256: 'a'.repeat(64) };
  const server = await startSharedInference({
    dataDir: root,
    client: {
      state: {
        closed: false,
        ready: true,
        get pending() {
          return state.pending;
        },
      },
      chooseExternal,
    },
    policy: () => (state.available ? policy : null),
  });
  const client = new SharedInferenceClient(root);
  const request: LearningDecisionRequest = {
    imagePath: join(run, '0001.png'),
    featurePath: join(run, 'features/0001.npz'),
    prompt: 'public state',
    candidates: [{ id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' }],
    controllerVersion: 3,
  };
  try {
    expect(await client.policy()).toEqual(policy);
    expect((await client.choose(request, checkpoint))?.text).toBe('{"choice":0}');
    expect(chooseExternal).toHaveBeenCalledTimes(1);
    state.pending = 1;
    expect(await client.choose(request, checkpoint)).toBeNull();
    state.pending = 0;
    state.available = false;
    expect(await client.policy()).toBeNull();
    expect(await client.choose(request, checkpoint)).toBeNull();
    state.available = true;
    await expect(
      client.choose({ ...request, featurePath: join(root, 'qwen/current.json') }, checkpoint),
    ).rejects.toThrow('invalid_owned_path');
    await expect(client.call('/train', { episode: run })).rejects.toThrow('unsupported_operation');
    expect(chooseExternal).toHaveBeenCalledTimes(1);
  } finally {
    await server.close();
    await expect(readFile(join(root, 'qwen/shared-inference.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await rm(root, { recursive: true, force: true });
  }
});
