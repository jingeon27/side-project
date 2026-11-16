import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../database/database.service';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import { mediaContentType, type MediaStorage } from '../storage/media-storage.service';
import { RequestProfileAvatarUploadSchema } from './profile.dto';
import { ProfileService } from './profile.service';

/** 저장 용량·대기 업로드가 비어 있는 트랜잭션과 서명만 돌려주는 저장소 대역 */
function createProfiles() {
  const presignUpload = vi.fn<MediaStorage['presignUpload']>(async (key) => ({
    url: 'https://bucket.test',
    fields: { key },
  }));
  const empty = { _sum: { byteSize: null } };
  const tx = {
    postUpload: { aggregate: async () => empty },
    profileUpload: {
      count: async () => 0,
      aggregate: async () => empty,
      create: async (args: { data: { expiresAt: Date } }) => ({ id: 'upload-1', ...args.data }),
    },
  };
  const profiles = new ProfileService(
    { atomic: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } as unknown as Database,
    { presignUpload } as unknown as MediaStorage,
    { consumeUploadBytes: async () => undefined } as unknown as RateLimitService,
  );
  return { profiles, presignUpload };
}

describe('ProfileService.requestUpload', () => {
  it.each(RequestProfileAvatarUploadSchema.shape.contentType.options)(
    '입력 검증을 통과한 %s 사진은 같은 형식으로 내려줄 키에 서명해야 한다',
    async (contentType) => {
      const { profiles, presignUpload } = createProfiles();
      const ticket = await profiles.requestUpload(
        { id: 'user-1', nickname: '회원', avatar: null },
        { contentType, byteSize: 1024 },
      );
      const key = ticket.fields.find((field) => field.name === 'key')?.value ?? '';
      expect(presignUpload).toHaveBeenCalledExactlyOnceWith(key, contentType, 1024, expect.any(Date));
      expect(mediaContentType(key)).toBe(contentType);
      expect(ticket.id).toBe('upload-1');
    },
  );
});
