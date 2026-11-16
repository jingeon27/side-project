import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, vi } from 'vitest';

import type { LearningDecisionRequest } from './learning-client.ts';
import { SharedInferenceClient, startSharedInference } from './shared-inference.ts';

// 처음 이어받은 후보가 격리 학습 폴더(arena/qwen/candidates)에 있으면 training 폴더 기준 검사가 트로피 판단을 모두 거부했다.
it('serves the shared candidate wherever it lives and refuses any other checkpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clash-shared-candidate-'));
  const run = join(root, 'trophy/runs/game');
  const shared = join(root, 'arena/qwen/candidates/study-a/checkpoints/v000002');
  const other = join(root, 'arena/qwen/training/private/checkpoints/v000001');
  await Promise.all([run, shared, other].map((directory) => mkdir(directory, { recursive: true })));
  await writeFile(join(run, '0001.png'), 'test image');
  const chooseExternal = vi.fn(async () => ({
    text: '{"choice":0}',
    elapsedMs: 1,
    peakGb: 0,
    behavior: { trainable: false },
  }));
  const server = await startSharedInference({
    dataDir: root,
    client: { state: { closed: false, ready: true, pending: 0 }, chooseExternal },
    policy: () => ({ checkpoint: shared, version: 2, weightsSHA256: 'b'.repeat(64) }),
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
    expect((await client.choose(request, shared))?.text).toBe('{"choice":0}');
    await expect(client.choose(request, other)).rejects.toThrow('invalid_owned_path');
    expect(chooseExternal).toHaveBeenCalledTimes(1);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
