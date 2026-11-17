import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { PYTHON_SOURCE_DIR, pythonEnvironment } from '../shared/python.ts';
import { MODEL } from './model.ts';

it('loads the same model contract and explicit data directory from an unrelated cwd', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-python-paths-'));
  try {
    const output = execFileSync(
      'python3',
      [
        '-c',
        [
          'import json',
          'from clash_bot.paths import DATA_DIR, CONTRACTS_DIR',
          'from clash_bot.qwen.model_specs import MODEL',
          'print(json.dumps({"data":str(DATA_DIR),"identity":MODEL["identity"],"contract":str(CONTRACTS_DIR/"model.json")}))',
        ].join('\n'),
      ],
      { cwd: directory, env: pythonEnvironment(directory), encoding: 'utf8' },
    );
    const result = JSON.parse(output) as { data: string; identity: string; contract: string };
    expect(result.data).toBe(await realpath(directory));
    expect(result.identity).toBe(MODEL.identity);
    expect(result.contract).toBe(join(PYTHON_SOURCE_DIR, '../contracts/model.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
