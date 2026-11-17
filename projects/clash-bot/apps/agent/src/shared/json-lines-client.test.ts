import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { JsonLineClient } from './json-lines-client.ts';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function workerScript(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'clash-rpc-'));
  directories.push(root);
  const path = join(root, 'worker.mjs');
  await writeFile(path, source);
  return path;
}

// close()가 종료를 기다리지 않고 SIGKILL도 없어, 잠금을 푼 뒤에도 이전 학습기가 남아 체크포인트를 쓸 수 있었다.
it('waits for exit and kills a worker that ignores the end of input and SIGTERM', async () => {
  const worker = await workerScript(
    `console.log(JSON.stringify({type:'ready'})); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`,
  );
  const client = new JsonLineClient(process.execPath, [worker], 'unused', [], undefined, {
    terminateAfterMs: 50,
    killAfterMs: 150,
  });
  await client.ready();
  await client.close();
  expect(client.child.signalCode).toBe('SIGKILL');
});

// 응답이 아닌 줄 하나가 섞이면 다음 요청이 앞 요청의 응답을 받았다.
it('closes the channel on a line that is not a JSON reply instead of shifting later replies', async () => {
  const worker = await workerScript(
    `import { createInterface } from 'node:readline';
console.log(JSON.stringify({type:'ready'}));
createInterface({input:process.stdin}).on('line', line => {
 console.log('native library warning');
 console.log(JSON.stringify({type:'result', name: JSON.parse(line).name}));
});`,
  );
  const client = new JsonLineClient(process.execPath, [worker], 'unused');
  try {
    await client.ready();
    await expect(client.request({ name: 'first' })).rejects.toThrow('JSON 응답이 아닌 줄');
    await expect(client.request({ name: 'second' })).rejects.toThrow('작업 실행기가 닫혔습니다.');
  } finally {
    await client.close();
  }
});
