import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import type { TLoginProvider } from '@game-feedback/bridge';

import { socialLogin } from '../lib/social-login';

function randomVerifier() {
  const bytes = Crypto.getRandomBytes(32);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function nativeLogin(origin: string, provider: TLoginProvider = 'google') {
  return socialLogin(
    origin,
    {
      randomVerifier,
      challenge: async (verifier) =>
        (
          await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
            encoding: Crypto.CryptoEncoding.BASE64,
          })
        )
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replace(/=+$/, ''),
      // iOS는 17.4+ ASWebAuthenticationSession의 https 콜백(.https(host:path:), associated domains 필요)으로 받는다.
      // 옵션이 없으면 이전 callbackURLScheme API로 열려 https 콜백이 돌아오지 않는다.
      // Android는 Custom Tabs를 열고 검증된 App Link로 앱에 돌아온 URL(Linking 'url')을 받는다.
      openSession: (url, callback) =>
        WebBrowser.openAuthSessionAsync(url, callback, { preferUniversalLinks: true }),
    },
    provider,
  );
}
