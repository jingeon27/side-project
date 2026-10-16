import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { IPhotoStore } from './photo-store';

function isMissingFile(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** 개발·단일 서버용. 사진은 소유자만 읽을 수 있는 권한으로 쓴다. */
export class LocalPhotoStore implements IPhotoStore {
  constructor(private readonly directory: string) {}

  async put(key: string, body: Buffer) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(this.directory, key), body, { mode: 0o600, flag: 'wx' });
  }

  get(key: string) {
    return readFile(resolve(this.directory, key));
  }

  async stream(key: string, range?: { start: number; end: number }) {
    const path = resolve(this.directory, key);
    const { size } = await stat(path);
    return { body: createReadStream(path, range), size };
  }

  async delete(key: string) {
    try {
      await unlink(resolve(this.directory, key));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
}
