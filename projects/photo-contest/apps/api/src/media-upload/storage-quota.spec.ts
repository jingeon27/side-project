import { describe, expect, it } from 'vitest';

import { ANONYMOUS_STORAGE_QUOTA_BYTES, USER_STORAGE_QUOTA_BYTES } from '../config/limits';
import { ANONYMOUS_STORAGE_QUOTA_EXCEEDED, STORAGE_QUOTA_EXCEEDED, storageQuotaOf } from './storage-quota';

describe('storageQuotaOf', () => {
  it('익명 계정은 회원보다 작은 한도와 가입 안내를 써야 한다', () => {
    expect(storageQuotaOf({ provider: 'anonymous' })).toEqual({
      bytes: ANONYMOUS_STORAGE_QUOTA_BYTES,
      message: ANONYMOUS_STORAGE_QUOTA_EXCEEDED,
    });
    expect(ANONYMOUS_STORAGE_QUOTA_BYTES).toBeLessThan(USER_STORAGE_QUOTA_BYTES);
  });

  it.each(['password', 'testing', undefined])('익명이 아닌 계정(%s)은 회원 한도를 써야 한다', (provider) => {
    expect(storageQuotaOf({ provider })).toEqual({
      bytes: USER_STORAGE_QUOTA_BYTES,
      message: STORAGE_QUOTA_EXCEEDED,
    });
  });
});
