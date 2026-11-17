import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { readJsonFile, readOptionalJsonFile } from './json-file.ts';

const schema = z.strictObject({ id: z.string(), count: z.int().nonnegative() });

const withDirectory = async (run: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-json-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

it('returns the value only when the saved file matches the current shape', () =>
  withDirectory(async (directory) => {
    const path = join(directory, 'state.json');
    await writeFile(path, JSON.stringify({ id: 'a', count: 2 }));
    await expect(readJsonFile(path, schema)).resolves.toEqual({ id: 'a', count: 2 });
    await writeFile(path, JSON.stringify({ id: 'a', count: 2, legacy: true }));
    await expect(readJsonFile(path, schema)).rejects.toThrow(`${path} 형식이 맞지 않습니다.`);
  }));

it('names the file and the field when the saved shape differs', () =>
  withDirectory(async (directory) => {
    const path = join(directory, 'state.json');
    await writeFile(path, JSON.stringify({ id: 'a', count: -1 }));
    await expect(readJsonFile(path, schema)).rejects.toThrow('count');
  }));

it('names the file when it is not JSON', () =>
  withDirectory(async (directory) => {
    const path = join(directory, 'state.json');
    await writeFile(path, '{"id":');
    await expect(readJsonFile(path, schema)).rejects.toThrow(`${path}가 JSON이 아닙니다.`);
  }));

it('treats only a missing file as absent', () =>
  withDirectory(async (directory) => {
    await expect(readOptionalJsonFile(join(directory, 'missing.json'), schema)).resolves.toBeNull();
    const path = join(directory, 'state.json');
    await writeFile(path, JSON.stringify({ id: 1 }));
    await expect(readOptionalJsonFile(path, schema)).rejects.toThrow('형식이 맞지 않습니다');
  }));
