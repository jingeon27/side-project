import { openAuthSessionAsync } from 'expo-web-browser';
import { describe, expect, it, vi } from 'vitest';

import { createNativeCapabilities } from './native-capabilities';

const CALLBACK_URL = 'https://contest.example/app-auth/callback';
const LOGIN_CODE = 'aGVsbG8td29ybGQtbG9naW4tY29kZQ';

// 감사 M3: 커스텀 스킴 콜백은 같은 스킴을 등록한 다른 앱도 받을 수 있었다.
describe('소셜 로그인 인증 세션', () => {
  it('웹 origin의 https 콜백을 Universal Link 콜백으로 열어야 한다', async () => {
    vi.mocked(openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: `${CALLBACK_URL}?code=${LOGIN_CODE}`,
    });

    const result = await createNativeCapabilities()['auth.socialLogin']({ provider: 'google' });

    expect(result.code).toBe(LOGIN_CODE);
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/contest\.example\/backend\/auth\/google\?app_challenge=[A-Za-z0-9_-]{43}$/,
      ),
      CALLBACK_URL,
      { preferUniversalLinks: true },
    );
  });

  it('커스텀 스킴으로 돌아온 코드는 받지 않아야 한다', async () => {
    vi.mocked(openAuthSessionAsync).mockResolvedValue({
      type: 'success',
      url: `photocontest://auth/callback?code=${LOGIN_CODE}`,
    });

    await expect(createNativeCapabilities()['auth.socialLogin']({ provider: 'kakao' })).rejects.toMatchObject(
      {
        code: 'FAILED',
      },
    );
  });
});
