import { Injectable } from '@nestjs/common';

import { s3Settings, storageBackend, storageDir } from '../config/env';
import { LocalPhotoStore } from './local-photo-store';
import { assertPhotoKey } from './photo-key';
import type { IPhotoStore } from './photo-store';
import { S3PhotoStore } from './s3-photo-store';

/** 비공개 사진 저장소. 설정은 호출할 때마다 읽어 테스트가 바꾼 STORAGE_DIR을 따른다. */
@Injectable()
export class PhotoStorage {
  private s3?: { signature: string; store: S3PhotoStore };

  put(key: string, body: Buffer) {
    return this.store().put(assertPhotoKey(key), body);
  }

  get(key: string) {
    return this.store().get(assertPhotoKey(key));
  }

  delete(key: string) {
    return this.store().delete(assertPhotoKey(key));
  }

  private store(): IPhotoStore {
    if (storageBackend() === 'local') return new LocalPhotoStore(storageDir());
    const settings = s3Settings();
    const signature = JSON.stringify(settings);
    // S3 클라이언트는 연결을 재사용하도록 설정이 같으면 계속 쓴다.
    if (this.s3?.signature !== signature) this.s3 = { signature, store: new S3PhotoStore(settings) };
    return this.s3.store;
  }
}
