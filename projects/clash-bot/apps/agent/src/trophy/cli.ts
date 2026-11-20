import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { DATA_DIR } from '../shared/data-dir.ts';
import { trophyBehaviorIdentity } from './fingerprint.ts';
import { trophyControl, trophyPlanSchema } from './protocol.ts';
import { TrophySession } from './session.ts';

const requestSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('next') }),
  z.strictObject({ op: z.literal('complete'), plan: trophyPlanSchema }),
  z.strictObject({ op: z.literal('status') }),
]);

async function main() {
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
  try {
    console.log(JSON.stringify({ type: 'ready', format: 'trophy-own-policy-learning-v1' }));
    for await (const line of createInterface({ input: process.stdin })) {
      try {
        const request = requestSchema.parse(JSON.parse(line));
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
    await session.close();
  }
}
main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
