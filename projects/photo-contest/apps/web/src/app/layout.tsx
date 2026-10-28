import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';

import { parseAppUserAgent } from '@photo-contest/bridge';

import { AppProviders } from '@/_app/providers';

import '@/_app/styles/tailwind.css';

import { getWebOrigin } from '@/shared/api/server-request.helper';
import { APP_MAIN_ID, APP_ROOT_ID, DARK_THEME_COLOR, THEME_COLOR } from '@/shared/constants/layout';
import { PRIVATE_ROBOTS, SITE_DESCRIPTION } from '@/shared/lib/seo.helper';
import { parseThemePreference, THEME_COOKIE } from '@/shared/model/theme/theme-preference';

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getWebOrigin()),
    title: { default: '별사대 — 별난 사진 대회', template: '%s · 별사대' },
    description: SITE_DESCRIPTION,
    robots: PRIVATE_ROBOTS,
  };
}

// 사진을 확대해 봐야 하므로 확대는 막지 않는다. 노치·홈 인디케이터 영역까지 그리고 안전 영역은 CSS env()로 비킨다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR },
    { media: '(prefers-color-scheme: dark)', color: DARK_THEME_COLOR },
  ],
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // 앱 WebView(User-Agent의 PhotoContestApp/x.y.z)면 표면만 바꾼다(예: 앱 설치 안내 숨김). 권한 판단에는 쓰지 않는다.
  const app = parseAppUserAgent((await headers()).get('user-agent'));
  const preference = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="ko" data-app={app?.appVersion} data-theme={preference}>
      <body>
        <div id={APP_ROOT_ID} className="flex min-h-dvh justify-center bg-canvas desktop:bg-sunken">
          <main
            id={APP_MAIN_ID}
            className="relative flex min-h-dvh w-full min-w-0 flex-col bg-surface desktop:bg-sunken desktop:has-[[data-desktop-nav]]:pl-48 wide:has-[[data-desktop-nav]]:pl-56"
          >
            <AppProviders themePreference={preference}>{children}</AppProviders>
          </main>
        </div>
      </body>
    </html>
  );
}
