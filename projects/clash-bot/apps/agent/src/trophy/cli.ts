import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { DATA_DIR } from '../shared/data-dir.ts';
import { JsonLineClient } from '../shared/json-lines-client.ts';
import { pythonEnvironment, pythonExecutable } from '../shared/python.ts';
import { trophyBehaviorIdentity } from './fingerprint.ts';
import { labelCommand, labelCommands } from './labels/commands.ts';
import { trophyControl, trophyPlanSchema } from './protocol.ts';
import { TrophySession } from './session.ts';

const requestSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('next') }),
  z.strictObject({
    op: z.literal('frame'),
    matchId: z.uuid(),
    sequence: z.int().positive().max(100000),
    at: z.int().nonnegative(),
    image: z.string().regex(/^[a-z0-9_-]+\.png$/),
    imageSHA256: z.string().regex(/^[a-f0-9]{64}$/),
    raw: z.record(z.string(), z.unknown()),
  }),
  z.strictObject({ op: z.literal('seal-frames'), matchId: z.uuid(), total: z.int().positive().max(100000) }),
  z.strictObject({ op: z.literal('complete'), plan: trophyPlanSchema }),
  z.strictObject({ op: z.literal('status') }),
]);

async function main() {
  const commandLine = process.argv.slice(2);
  if (labelCommands.has(commandLine[0] ?? '')) return labelCommand(DATA_DIR, commandLine);
  const args = parseArgs({
    allowPositionals: true,
    options: { seed: { type: 'string' }, evidence: { type: 'string', multiple: true } },
  });
  const command = args.positionals[0] ?? 'status';
  const control = trophyControl(DATA_DIR);
  if (command === 'status') {
    const status = await readFile(join(control, 'status.json'), 'utf8').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return JSON.stringify({ phase: 'not_started' });
        throw error;
      },
    );
    console.log(status);
    return;
  }
  if (command !== 'serve' || !args.values.seed || !args.values.evidence?.length)
    throw new Error('trophy status | serve --seed <policy.json> --evidence <고정 실행 파일>');
  const evidence = args.values.evidence.map((path) => resolve(path));
  const session = await TrophySession.open({
    dataDir: DATA_DIR,
    seedPolicy: resolve(args.values.seed),
    behaviorIdentity: () => trophyBehaviorIdentity(evidence),
  });
  const capture = new JsonLineClient(
    pythonExecutable(DATA_DIR),
    ['-m', 'clash_bot.perception.labels.capture'],
    '',
    [],
    pythonEnvironment(DATA_DIR),
  );
  try {
    await capture.ready();
    console.log(JSON.stringify({ type: 'ready', format: 'trophy-own-policy-learning-v1' }));
    for await (const line of createInterface({ input: process.stdin })) {
      try {
        const request = requestSchema.parse(JSON.parse(line));
        if (request.op === 'frame' || request.op === 'seal-frames') {
          const plan = session.status().pending;
          if (!plan || plan.id !== request.matchId || plan.role === 'recovery')
            throw new Error('활성 경기의 프레임만 기록할 수 있습니다.');
          const response = await capture.request(
            request.op === 'frame'
              ? { op: 'frame', plan, item: request }
              : { op: 'seal', plan, total: request.total },
          );
          console.log(JSON.stringify(response));
          continue;
        }
        if (request.op === 'next') {
          console.log(JSON.stringify({ type: 'result', plan: await session.nextMatch() }));
          continue;
        }
        if (request.op === 'complete') {
          console.log(JSON.stringify({ type: 'result', status: await session.complete(request.plan) }));
          continue;
        }
        console.log(JSON.stringify({ type: 'result', status: session.status() }));
      } catch (error) {
        console.error(error);
        console.log(JSON.stringify({ type: 'error', message: String(error) }));
      }
    }
  } finally {
    await capture.close();
    await session.close();
  }
}
main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
