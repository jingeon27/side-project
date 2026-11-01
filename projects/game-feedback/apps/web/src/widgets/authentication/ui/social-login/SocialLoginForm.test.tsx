import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider, type TLocale } from '@/shared/i18n';

import { SocialLoginForm } from './SocialLoginForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

afterEach(() => {
  Reflect.deleteProperty(window, '__GAME_FEEDBACK_APP__');
  Reflect.deleteProperty(window, 'ReactNativeWebView');
});

describe('WebView 로그인 안내', () => {
  it.each([
    ['ko', '로그인은 웹 브라우저에서 이용해 주세요.'],
    ['en', 'Please sign in using a web browser.'],
    ['ja', 'ログインはウェブブラウザーで行ってください。'],
  ] satisfies Array<[TLocale, string]>)(
    '%s에서도 앱 로그인 대신 번역된 웹 안내만 표시해야 한다',
    (locale, message) => {
      const postMessage = vi.fn();
      Reflect.set(window, '__GAME_FEEDBACK_APP__', { protocol: 1 });
      Reflect.set(window, 'ReactNativeWebView', { postMessage });
      render(
        <QueryClientProvider client={new QueryClient()}>
          <LanguageProvider initialLocale={locale} initialPreference="auto" automaticLocale={locale}>
            <SocialLoginForm providers={[{ provider: 'google', configured: true }]} returnTo={`/${locale}`} />
          </LanguageProvider>
        </QueryClientProvider>,
      );
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
      expect(postMessage).not.toHaveBeenCalled();
    },
  );
});
