import {
  MEDIA_ANALYSIS_TIMEOUT_MS,
  MEDIA_RANGE_BLOCK_BYTES,
  MEDIA_RANGE_CACHE_BLOCKS,
  MAX_MEDIA_ANALYSIS_BYTES,
  MAX_MEDIA_RANGE_REQUESTS,
} from '../config/limits';
import type { MediaStorage } from './media-storage.service';

export interface IMediaReader {
  byteSize: number;
  read: (start: number, length: number) => Promise<Buffer>;
}

/** 필요한 범위만 읽고 파일 크기와 관계없이 캐시 용량을 제한한다. */
export class MediaReader implements IMediaReader {
  private readonly cache = new Map<number, Buffer>();
  private deadline?: number;
  private requests = 0;
  private bytes = 0;
  constructor(
    private readonly storage: Pick<MediaStorage, 'readRange'>,
    private readonly key: string,
    readonly byteSize: number,
    private readonly blockBytes = MEDIA_RANGE_BLOCK_BYTES,
  ) {
    if (!Number.isSafeInteger(blockBytes) || blockBytes <= 0 || blockBytes > MEDIA_RANGE_BLOCK_BYTES)
      throw new Error('Invalid media block size');
  }

  async read(start: number, length: number) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < 0 ||
      start >= this.byteSize ||
      length <= 0 ||
      length > MEDIA_RANGE_BLOCK_BYTES
    )
      throw new Error('Invalid media read');
    this.deadline ??= Date.now() + MEDIA_ANALYSIS_TIMEOUT_MS;
    if (Date.now() >= this.deadline) throw new Error('Media analysis timed out');
    const end = Math.min(this.byteSize, start + length);
    const chunks: Buffer[] = [];
    for (let offset = start; offset < end;) {
      const block = Math.floor(offset / this.blockBytes);
      const bytes = await this.block(block);
      const within = offset % this.blockBytes;
      const count = Math.min(end - offset, bytes.length - within);
      chunks.push(bytes.subarray(within, within + count));
      offset += count;
    }
    return Buffer.concat(chunks, end - start);
  }
  private async block(index: number) {
    const cached = this.cache.get(index);
    if (cached) {
      this.cache.delete(index);
      this.cache.set(index, cached);
      return cached;
    }
    if (Date.now() >= (this.deadline ?? Infinity) || ++this.requests > MAX_MEDIA_RANGE_REQUESTS)
      throw new Error('Media analysis limit exceeded');
    const start = index * this.blockBytes;
    const end = Math.min(this.byteSize, start + this.blockBytes) - 1;
    this.bytes += end - start + 1;
    if (this.bytes > MAX_MEDIA_ANALYSIS_BYTES) throw new Error('Media analysis byte limit exceeded');
    const bytes = await this.storage.readRange(this.key, start, end);
    if (bytes.length !== end - start + 1) throw new Error('Incomplete media range');
    if (this.cache.size >= MEDIA_RANGE_CACHE_BLOCKS) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(index, bytes);
    return bytes;
  }
}
