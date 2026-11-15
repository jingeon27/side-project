import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { QwenClient } from './qwen-client.ts';

it('keeps simultaneous tab requests paired with their replies and recovers after a worker error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'clash-rpc-'));
  const worker = join(root, 'worker.mjs');
  await writeFile(
    worker,
    `import { createInterface } from 'node:readline';
console.log(JSON.stringify({type:'ready'}));
createInterface({input:process.stdin}).on('line', line => {
 const request = JSON.parse(line);
 setTimeout(() => console.log(JSON.stringify(request.fail ? {type:'error',message:'test failure'} : {type:'result',name:request.name})), request.delay ?? 0);
});`,
  );
  const client = new QwenClient(process.execPath, worker, 'unused');
  try {
    await client.ready();
    const results = await Promise.all([
      client.request({ name: 'first', delay: 40 }),
      client.request({ name: 'second' }),
    ]);
    expect(results.map((result) => result.name)).toEqual(['first', 'second']);
    await expect(client.request({ fail: true })).rejects.toThrow('test failure');
    expect((await client.request({ name: 'after-error' })).name).toBe('after-error');
  } finally {
    client.close();
    if (client.child.exitCode === null) await once(client.child, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});
