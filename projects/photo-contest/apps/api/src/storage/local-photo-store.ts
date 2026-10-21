import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import { LOCAL_UPLOAD_ORPHAN_TTL_MS } from '../config/limits';
import type { IPhotoStore } from './photo-store';

const UUID_PATTERN = '[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}';
const STAGING_FILENAME = new RegExp(`^${UUID_PATTERN}(?:\\.type)?$`);
const TEMPORARY_FILENAME = new RegExp(`^\\.${UUID_PATTERN}\\.upload$`);

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
  async head(key: string) {
    const { size } = await stat(resolve(this.directory, key));
    const types: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    const contentType =
      types[extname(key)] ?? (await readFile(resolve(this.directory, `${key}.type`), 'utf8'));
    return { byteSize: size, contentType };
  }
  async copy(source: string, destination: string) {
    await copyFile(
      resolve(this.directory, source),
      resolve(this.directory, destination),
      constants.COPYFILE_EXCL,
    );
  }
  async readRange(key: string, start: number, end: number) {
    const handle = await open(resolve(this.directory, key), 'r');
    try {
      const bytes = Buffer.alloc(end - start + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, start);
      if (bytesRead !== bytes.length) throw new Error('Incomplete media range');
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async acceptUpload(key: string, temporaryPath: string, contentType: string) {
    const destination = resolve(this.directory, key);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(`${destination}.type`, contentType, { mode: 0o600 });
    // 복사하는 도중 재전송해도 이미 열린 원본 파일의 바이트가 바뀌지 않게 한다.
    await rename(temporaryPath, destination);
  }
  async deleteMedia(key: string) {
    await this.delete(key);
    await this.delete(`${key}.type`);
  }
  async pruneAbandoned(now: Date, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid cleanup limit');
    if (!limit) return 0;
    try {
      if (!(await lstat(this.directory)).isDirectory()) return 0;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      return 0;
    }
    const before = now.getTime() - LOCAL_UPLOAD_ORPHAN_TTL_MS;
    let removed = 0;
    const directories = [
      { path: resolve(this.directory, 'staging'), pattern: STAGING_FILENAME },
      { path: this.directory, pattern: TEMPORARY_FILENAME },
    ];
    for (const directory of directories) {
      if (removed >= limit) break;
      try {
        if (!(await lstat(directory.path)).isDirectory()) continue;
        // 디렉터리를 한 번에 메모리로 읽거나 심볼릭 링크를 따라가지 않는다.
        const entries = await opendir(directory.path);
        for await (const entry of entries) {
          if (removed >= limit) break;
          if (!entry.isFile() || !directory.pattern.test(entry.name)) continue;
          const path = resolve(directory.path, entry.name);
          const file = await lstat(path);
          if (!file.isFile() || file.mtimeMs >= before) continue;
          await unlink(path);
          removed++;
        }
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }
    return removed;
  }
}
