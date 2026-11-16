import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { createServer, request as httpRequest, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { z } from 'zod';

import { atomicWrite } from '../shared/assets.ts';
import { inside } from '../shared/paths.ts';
import type { DecisionOutput, ExternalDecisionRequest, LearningClient } from './learning-client.ts';

export type SharedPolicy = { checkpoint: string; version: number; weightsSHA256: string };
const payloadSchema = z
  .object({
    checkpoint: z.string(),
    imagePath: z.string(),
    featurePath: z.string(),
    prompt: z.string().max(8000),
    candidates: z
      .array(
        z
          .object({
            id: z.int(),
            slot: z.int().min(0).max(4),
            card: z.string().nullable(),
            target: z.object({ x: z.number().finite(), y: z.number().finite() }),
            description: z.string(),
          })
          .passthrough(),
      )
      .min(1)
      .max(26),
  })
  .strict();

const matchEndSchema = z.object({ id: z.string().uuid() }).strict();

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  const received = { bytes: 0 };
  for await (const part of request) {
    const chunk = Buffer.from(part);
    received.bytes += chunk.length;
    if (received.bytes > 32_768) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

export async function startSharedInference(options: {
  dataDir: string;
  client: Pick<LearningClient, 'state' | 'chooseExternal'>;
  policy: () => SharedPolicy | null;
  // 트로피 경기 상한 600초에 여유를 더한 값이다. 트로피가 멈춰도 이 시간이 지나면 학습을 다시 진행한다.
  matchLeaseMs?: number;
}) {
  const id = randomUUID();
  const leaseMs = options.matchLeaseMs ?? 660_000;
  // 경기 id별 만료 시각. 진행 중인 트로피 경기가 있는 동안 Counterpush는 후보 공유를 닫지 않는다.
  const matches = new Map<string, number>();
  const activeMatch = () => [...matches.values()].some((expiresAt) => expiresAt > performance.now());
  const identity = createHash('sha256').update(resolve(options.dataDir)).digest('hex').slice(0, 12);
  const socket = join(
    process.platform === 'darwin' ? '/tmp' : tmpdir(),
    `clash-qwen-${identity}-${process.pid}.sock`,
  );
  const registry = join(options.dataDir, 'qwen/shared-inference.json');
  const server = createServer(async (request, response) => {
    const reply = (code: number, value: unknown) => {
      if (!response.destroyed)
        response.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(value));
    };
    try {
      // 경기 종료는 후보 공유가 이미 닫혀 있어도 받는다.
      if (request.method === 'POST' && request.url === '/match/end') {
        const body = await readBody(request);
        if (body === null) return reply(413, { reason: 'request_too_large' });
        matches.delete(matchEndSchema.parse(JSON.parse(body)).id);
        return reply(200, { ended: true });
      }
      const policy = options.policy();
      if (!policy) return reply(503, { reason: 'qualification_or_training_busy' });
      if (request.method === 'GET' && request.url === '/policy') return reply(200, policy);
      if (request.method === 'POST' && request.url === '/match/begin') {
        const match = randomUUID();
        matches.set(match, performance.now() + leaseMs);
        return reply(200, { id: match, policy });
      }
      if (request.method !== 'POST' || request.url !== '/choose')
        return reply(404, { reason: 'unsupported_operation' });
      const body = await readBody(request);
      if (body === null) return reply(413, { reason: 'request_too_large' });
      const input = payloadSchema.parse(JSON.parse(body));
      const root = await realpath(join(options.dataDir, 'trophy/runs'));
      const image = await realpath(input.imagePath);
      const checkpoint = await realpath(input.checkpoint);
      // 트로피는 지금 공유 중인 후보 체크포인트만 읽는다. 후보가 격리 학습 폴더에서 왔어도 같은 파일이면 허용한다.
      if (
        !inside(root, image) ||
        checkpoint !== (await realpath(policy.checkpoint)) ||
        dirname(resolve(input.featurePath)) !== join(dirname(resolve(input.imagePath)), 'features') ||
        !/^\d{4}\.npz$/.test(basename(input.featurePath))
      )
        return reply(400, { reason: 'invalid_owned_path' });
      const features = join(dirname(image), 'features');
      await mkdir(features, { recursive: true, mode: 0o700 });
      if ((await realpath(features)) !== features) return reply(400, { reason: 'invalid_owned_path' });
      // External work never queues behind a game decision or a long update.
      // Recheck after reading the body because the main loop may have advanced or moved to another candidate.
      if (options.policy()?.checkpoint !== policy.checkpoint || options.client.state.pending > 0)
        return reply(503, { reason: 'model_busy' });
      const started = performance.now();
      const output = await options.client.chooseExternal(
        {
          ...input,
          imagePath: image,
          featurePath: join(features, basename(input.featurePath)),
        } as ExternalDecisionRequest,
        checkpoint,
      );
      return reply(200, { ...output, elapsedMs: Math.round(performance.now() - started) });
    } catch (error) {
      return reply(400, { reason: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(socket, accept);
  });
  await chmod(socket, 0o600);
  await atomicWrite(registry, JSON.stringify({ id, pid: process.pid, socket }) + '\n');
  return {
    activeMatch,
    matchFinished: async (signal: AbortSignal) => {
      while (activeMatch()) await delay(1000, undefined, { signal });
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
      const current = (await readFile(registry, 'utf8')
        .then(JSON.parse)
        .catch(() => null)) as { id?: string } | null;
      if (current?.id === id) await rm(registry, { force: true });
      await rm(socket, { force: true });
    },
  };
}

export class SharedInferenceClient {
  readonly dataDir: string;
  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }
  async call(route: string, payload?: unknown): Promise<unknown | null> {
    const registry = JSON.parse(await readFile(join(this.dataDir, 'qwen/shared-inference.json'), 'utf8')) as {
      socket: string;
    };
    return new Promise((accept, reject) => {
      const request = httpRequest(
        { socketPath: registry.socket, path: route, method: payload ? 'POST' : 'GET' },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (part: Buffer) => chunks.push(part));
          response.on('end', () => {
            if (response.statusCode === 503) return accept(null);
            try {
              const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
              if (response.statusCode !== 200) return reject(new Error(JSON.stringify(value)));
              accept(value);
            } catch (error) {
              reject(error);
            }
          });
          response.on('error', reject);
        },
      );
      request.once('error', reject);
      request.setTimeout(1000, () => request.destroy(new Error('Shared model decision deadline')));
      request.end(payload ? JSON.stringify(payload) : undefined);
    });
  }
  async policy(): Promise<SharedPolicy | null> {
    return (await this.call('/policy')) as SharedPolicy | null;
  }
  // 경기를 시작할 때 공유 후보를 받고 임대를 연다. 후보 공유가 닫혀 있으면 null이다.
  async beginMatch(): Promise<{ id: string; policy: SharedPolicy } | null> {
    return (await this.call('/match/begin', {})) as { id: string; policy: SharedPolicy } | null;
  }
  async endMatch(id: string): Promise<void> {
    await this.call('/match/end', { id });
  }
  async choose(input: ExternalDecisionRequest, checkpoint: string): Promise<DecisionOutput | null> {
    const started = performance.now();
    const result = (await this.call('/choose', { ...input, checkpoint }).catch(
      (error: NodeJS.ErrnoException) => {
        if (
          ['ECONNREFUSED', 'ENOENT', 'ECONNRESET'].includes(error.code ?? '') ||
          error.message === 'Shared model decision deadline'
        )
          return null;
        throw error;
      },
    )) as DecisionOutput | null;
    return result ? { ...result, elapsedMs: Math.round(performance.now() - started) } : null;
  }
}
