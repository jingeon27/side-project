import { describe, expect, it } from 'vitest';

import { onboardingSchema, profileSchema } from './profile.schema';

const profile = { nickname: ' 웃는 친구 ', avatar: null, removeAvatar: false };

describe('프로필 스키마', () => {
  it('MY 프로필 수정은 약관 동의 없이 닉네임·사진만 받아야 한다', () => {
    expect(profileSchema.parse(profile)).toEqual({
      nickname: '웃는 친구',
      avatar: null,
      removeAvatar: false,
    });
    expect(Object.keys(profileSchema.shape)).not.toContain('acceptedTerms');
  });

  it('가입 설정은 약관에 동의해야 통과해야 한다', () => {
    const rejected = onboardingSchema.safeParse({ ...profile, acceptedTerms: false });
    expect(rejected.success).toBe(false);
    expect(rejected.error?.issues).toMatchObject([
      { path: ['acceptedTerms'], message: '이용약관과 개인정보 처리방침을 확인하고 동의해 주세요.' },
    ]);
    expect(onboardingSchema.parse({ ...profile, acceptedTerms: true })).toMatchObject({
      acceptedTerms: true,
    });
  });
});
