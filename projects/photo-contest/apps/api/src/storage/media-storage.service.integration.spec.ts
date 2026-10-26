import { afterEach, describe, expect, inject, it, vi } from 'vitest';

import { uploadToStorage } from '../../test/support/app';
import { createMediaKey, MediaStorage } from './media-storage.service';

afterEach(() => vi.unstubAllEnvs());

describe('실제 S3 미디어 저장소', () => {
  it('서명 POST의 크기 정책을 적용하고 HEAD와 DELETE로 객체를 확인해야 한다', async () => {
    for (const [name, value] of Object.entries(inject('s3Env'))) vi.stubEnv(name, value);
    const storage = new MediaStorage();
    const key = createMediaKey('png');
    const form = await storage.presignUpload(key, 'image/png', 4, new Date(Date.now() + 300_000));
    const grant = {
      url: form.url,
      fields: Object.entries(form.fields).map(([name, value]) => ({ name, value })),
    };
    try {
      expect((await uploadToStorage(grant, new Uint8Array([1, 2, 3, 4, 5]), 'image/png')).ok).toBe(false);
      expect((await uploadToStorage(grant, new Uint8Array([1, 2, 3, 4]), 'image/png')).status).toBe(204);
      expect(await storage.head(key)).toEqual({ byteSize: 4, contentType: 'image/png' });
      await storage.delete(key);
      await expect(storage.head(key)).rejects.toThrow();
    } finally {
      await storage.delete(key);
    }
  });
});
