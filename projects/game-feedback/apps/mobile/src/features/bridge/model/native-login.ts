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
      openSession: (url, callback) => WebBrowser.openAuthSessionAsync(url, callback),
    },
    provider,
  );
}
