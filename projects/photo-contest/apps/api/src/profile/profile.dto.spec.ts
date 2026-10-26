import { describe, expect, it } from 'vitest';

import { createInputValidationPipe } from '../common/input-validation';
import { MAX_UPLOAD_BYTES } from '../config/limits';
import {
  CompleteOnboardingSchema,
  RequestProfileAvatarUploadSchema,
  UpdateMyProfileSchema,
} from './profile.dto';

const pipe = createInputValidationPipe();

describe('Zod profile inputs', () => {
  it('normalizes a nickname and preserves nullable avatar options for GraphQL', async () => {
    await expect(
      pipe.transform(
        { nickname: '  친구  ', avatarId: null, removeAvatar: null },
        { type: 'custom', schema: UpdateMyProfileSchema },
      ),
    ).resolves.toEqual({ nickname: '친구', avatarId: null, removeAvatar: null });
  });

  it('requires consent during onboarding and rejects fields outside each request schema', async () => {
    for (const value of [
      { nickname: '친구' },
      { nickname: '친구', acceptedTerms: false },
      { nickname: '친구', acceptedTerms: true, role: 'ADMIN' },
      JSON.parse('{"nickname":"친구","acceptedTerms":true,"__proto__":{"role":"ADMIN"}}'),
    ]) {
      await expect(
        pipe.transform(value, { type: 'custom', schema: CompleteOnboardingSchema }),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    }
    await expect(
      pipe.transform(
        { nickname: '친구', acceptedTerms: true },
        { type: 'custom', schema: CompleteOnboardingSchema },
      ),
    ).resolves.toEqual({ nickname: '친구', acceptedTerms: true });
  });

  it('accepts only supported images with an integer size in the upload range', async () => {
    for (const byteSize of ['1024', 0, 1.5, MAX_UPLOAD_BYTES + 1]) {
      await expect(
        pipe.transform(
          { contentType: 'image/png', byteSize },
          { type: 'custom', schema: RequestProfileAvatarUploadSchema },
        ),
      ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    }
    await expect(
      pipe.transform(
        { contentType: 'image/svg+xml', byteSize: 1024 },
        { type: 'custom', schema: RequestProfileAvatarUploadSchema },
      ),
    ).rejects.toThrow('JPEG·PNG·WebP 사진을 선택해 주세요.');
    await expect(
      pipe.transform(
        { contentType: 'image/png', byteSize: MAX_UPLOAD_BYTES },
        { type: 'custom', schema: RequestProfileAvatarUploadSchema },
      ),
    ).resolves.toEqual({ contentType: 'image/png', byteSize: MAX_UPLOAD_BYTES });
  });
});
