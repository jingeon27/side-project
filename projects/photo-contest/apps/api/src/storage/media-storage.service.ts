import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { match } from 'ts-pattern';

import { s3KeyPrefix, s3Settings, storageBackend, storageDir } from '../config/env';
import { LocalPhotoStore } from './local-photo-store';
import { S3PhotoStore } from './s3-photo-store';
import { createLocalUploadGrant } from './local-upload-grant';
import { CLEANUP_BATCH_SIZE, MEDIA_RANGE_BLOCK_BYTES } from '../config/limits';

function mediaKey(key: string) {
  if (!/^(?:[A-Za-z0-9_-]+\/)*[a-f0-9-]{36}\.(jpg|png|webp|mp4|webm)$/.test(key))
    throw new Error('Invalid media key');
  return key;
}
function objectKey(key: string) {
  if (/^(?:[A-Za-z0-9_-]+\/)*staging\/[a-f0-9-]{36}$/.test(key)) return key;
  return mediaKey(key);
}
export function createMediaKey(extension: 'jpg' | 'png' | 'webp' | 'mp4' | 'webm') {
  return `${storageBackend() === 's3' ? s3KeyPrefix() : ''}${randomUUID()}.${extension}`;
}
export function createStagingKey() {
  return `${storageBackend() === 's3' ? s3KeyPrefix() : ''}staging/${randomUUID()}`;
}
@Injectable()
export class MediaStorage {
  private s3?: { signature: string; store: S3PhotoStore };
  put(key: string, body: Buffer, contentType: string) {
    return this.store().put(mediaKey(key), body, contentType);
  }
  stream(key: string, range?: { start: number; end: number }) {
    return this.store().stream(mediaKey(key), range);
  }
  delete(key: string) {
    const store = this.store();
    const safe = objectKey(key);
    if (store instanceof LocalPhotoStore) return store.deleteMedia(safe);
    return store.delete(safe);
  }
  async pruneAbandoned(now: Date) {
    if (storageBackend() !== 'local') return;
    await new LocalPhotoStore(storageDir()).pruneAbandoned(now, CLEANUP_BATCH_SIZE);
  }
  head(key: string) {
    return this.store().head(objectKey(key));
  }
  copy(source: string, destination: string) {
    return this.store().copy(objectKey(source), mediaKey(destination));
  }
  readRange(key: string, start: number, end: number) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end - start + 1 > MEDIA_RANGE_BLOCK_BYTES
    )
      throw new Error('Invalid media range');
    return this.store().readRange(mediaKey(key), start, end);
  }
  presignUpload(key: string, contentType: string, byteSize: number, expiresAt: Date) {
    if (!/^(?:[A-Za-z0-9_-]+\/)*staging\/[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid staging key');
    if (storageBackend() === 's3')
      return this.s3Store().presignUpload(
        key,
        contentType,
        byteSize,
        Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
      );
    return createLocalUploadGrant({ key, contentType, byteSize, expiresAt: expiresAt.getTime() });
  }
  async presignDownload(key: string, disposition: string, expiresIn: number): Promise<string | null> {
    if (storageBackend() !== 's3') return null;
    return this.s3Store().presignDownload(mediaKey(key), disposition, expiresIn);
  }
  private store() {
    return match(storageBackend())
      .with('local', () => new LocalPhotoStore(storageDir()))
      .with('s3', () => this.s3Store())
      .exhaustive();
  }
  private s3Store() {
    const settings = s3Settings();
    const signature = JSON.stringify(settings);
    if (this.s3?.signature !== signature) this.s3 = { signature, store: new S3PhotoStore(settings) };
    return this.s3.store;
  }
}
