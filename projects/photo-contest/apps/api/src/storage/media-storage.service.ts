import { randomUUID } from 'node:crypto';

import { match } from 'ts-pattern';

import { Injectable } from '@nestjs/common';

import { s3Settings, storageBackend, storageDir } from '../config/env';
import { LocalPhotoStore } from './local-photo-store';
import { S3PhotoStore } from './s3-photo-store';

function mediaKey(key: string) {
  if (!/^[a-f0-9-]{36}\.(webp|mp4|webm)$/.test(key)) throw new Error('Invalid media key');
  return key;
}
export function createMediaKey(extension: 'webp' | 'mp4' | 'webm') {
  return `${randomUUID()}.${extension}`;
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
    return this.store().delete(mediaKey(key));
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
