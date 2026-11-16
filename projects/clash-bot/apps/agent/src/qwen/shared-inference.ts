import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { z } from 'zod';

import { atomicWrite } from '../assets.ts';
import type { DecisionOutput, LearningClient, LearningDecisionRequest } from '../learning-client.ts';

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
const inside = (root: string, path: string) => {
  const difference = relative(root, path);
  return (
    difference !== '' && !isAbsolute(difference) && difference !== '..' && !difference.startsWith('..' + sep)
  );
};

export async function startSharedInference(options: {
  dataDir: string;
  client: Pick<LearningClient, 'state' | 'chooseExternal'>;
  policy: () => SharedPolicy | null;
}) {
  const id = randomUUID();
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
      const policy = options.policy();
      if (!policy) return reply(503, { reason: 'qualification_or_training_busy' });
      if (request.method === 'GET' && request.url === '/policy') return reply(200, policy);
      if (request.method !== 'POST' || request.url !== '/choose')
        return reply(404, { reason: 'unsupported_operation' });
      const chunks: Buffer[] = [];
      const received = { bytes: 0 };
      for await (const part of request) {
        const chunk = Buffer.from(part);
        received.bytes += chunk.length;
        if (received.bytes > 32_768) return reply(413, { reason: 'request_too_large' });
        chunks.push(chunk);
      }
      const input = payloadSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
      const root = await realpath(join(options.dataDir, 'trophy/runs'));
      const image = await realpath(input.imagePath);
      const checkpoint = await realpath(input.checkpoint);
      const training = await realpath(join(options.dataDir, 'arena/qwen/training'));
      if (
        !inside(root, image) ||
        !inside(training, checkpoint) ||
        dirname(resolve(input.featurePath)) !== join(dirname(resolve(input.imagePath)), 'features') ||
        !/^\d{4}\.npz$/.test(basename(input.featurePath))
      )
        return reply(400, { reason: 'invalid_owned_path' });
      const features = join(dirname(image), 'features');
      await mkdir(features, { recursive: true, mode: 0o700 });
      if ((await realpath(features)) !== features) return reply(400, { reason: 'invalid_owned_path' });
      // External work never queues behind a game decision or a long update.
      // Recheck after reading the body because the main loop may have advanced.
      if (!options.policy() || options.client.state.pending > 0) return reply(503, { reason: 'model_busy' });
      const started = performance.now();
      const output = await options.client.chooseExternal(
        {
          ...input,
          imagePath: image,
          featurePath: join(features, basename(input.featurePath)),
        } as LearningDecisionRequest,
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
  async choose(input: LearningDecisionRequest, checkpoint: string): Promise<DecisionOutput | null> {
    const started = performance.now();
    const { controllerVersion: _, ...payload } = input;
    const result = (await this.call('/choose', { ...payload, checkpoint }).catch(
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
