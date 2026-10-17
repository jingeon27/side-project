import type { Metadata, Viewport } from 'next';
import { ServiceProviders } from '@/_app/index.server';
import { getSeoConfig } from '@/shared/seo';
import { cookies, headers } from 'next/headers';
import { LanguageProvider } from '@/shared/i18n';
import { ThemeProvider } from '@/shared/theme';
import { THEME_COOKIE, themePreference } from '@/shared/theme/index.server';
import {
  detectLocale,
  isLocale,
  languagePreference,
  LANGUAGE_COOKIE,
  LOCALE_HEADER,
} from '@/shared/i18n/index.server';
import '@/_app/styles/tailwind.css';
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};
export const metadata: Metadata = {
  metadataBase: new URL(getSeoConfig().origin),
  title: { default: '플레이메이트 | Game Feedback', template: '%s | 플레이메이트' },
  description: '클래시 로얄 플레이어를 위한 게임 피드백 커뮤니티.',
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const candidate = requestHeaders.get(LOCALE_HEADER);
  const automaticLocale = detectLocale(requestHeaders.get('accept-language'));
  const locale = isLocale(candidate) ? candidate : automaticLocale;
  const preference = languagePreference(cookieStore.get(LANGUAGE_COOKIE)?.value);
  const theme = themePreference(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} data-theme={theme}>
      <body>
        <LanguageProvider
          initialLocale={locale}
          initialPreference={preference}
          automaticLocale={automaticLocale}
        >
          <ThemeProvider initialPreference={theme}>
            <ServiceProviders>{children}</ServiceProviders>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
