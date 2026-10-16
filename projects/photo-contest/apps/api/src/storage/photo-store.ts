import type { Readable } from 'node:stream';

export interface IPhotoStore {
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string, range?: { start: number; end: number }): Promise<{ body: Readable; size: number }>;
  delete(key: string): Promise<void>;
}
