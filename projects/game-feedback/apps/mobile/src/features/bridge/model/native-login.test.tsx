import * as WebBrowser from 'expo-web-browser';
import { describe, expect, it, vi } from 'vitest';

import { nativeLogin } from './native-login';

const origin = 'https://feedback.example';
const callback = `${origin}/app-auth/callback`;
const code = 'b'.repeat(43);

// 감사 M3: 커스텀 스킴 콜백은 같은 스킴을 등록한 다른 앱도 받을 수 있었다.
describe('native social login session', () => {
  it('opens the verified HTTPS callback as an iOS Universal Link callback', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: `${callback}?code=${code}`,
    });

    await expect(nativeLogin(origin, 'kakao')).resolves.toMatchObject({ status: 'success', code });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/feedback\.example\/api\/auth\/social\/kakao\?app_challenge=[A-Za-z0-9_-]{43}$/,
      ),
      callback,
      { preferUniversalLinks: true },
    );
  });

  it('does not accept a code returned through the custom scheme', async () => {
    vi.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValueOnce({
      type: 'success',
      url: `gamefeedback://auth/callback?code=${code}`,
    });

    await expect(nativeLogin(origin)).resolves.toEqual({ status: 'failed' });
  });
});
