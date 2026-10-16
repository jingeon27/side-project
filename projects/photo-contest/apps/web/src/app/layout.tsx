import { parseAppUserAgent } from '@photo-contest/bridge';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AppProviders } from '@/_app/providers';
import '@/_app/styles/tailwind.css';
import { APP_MAIN_ID, APP_ROOT_ID, THEME_COLOR } from '@/shared/constants/layout';

export const metadata: Metadata = {
  title: { default: '웃긴순간 — 우리끼리 웃긴순간 갤러리', template: '%s · 웃긴순간' },
  description: '사진·동영상·합성으로 웃긴 순간을 나누는 우리끼리 갤러리.',
};

// 사진을 확대해 봐야 하므로 확대는 막지 않는다. 노치·홈 인디케이터 영역까지 그리고 안전 영역은 CSS env()로 비킨다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: THEME_COLOR,
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // 앱 WebView(User-Agent의 PhotoContestApp/x.y.z)면 표면만 바꾼다(예: 앱 설치 안내 숨김). 권한 판단에는 쓰지 않는다.
  const app = parseAppUserAgent((await headers()).get('user-agent'));
  return (
    <html lang="ko" data-app={app?.appVersion}>
      <body>
        <div id={APP_ROOT_ID} className="flex min-h-dvh justify-center bg-canvas">
          <main
            id={APP_MAIN_ID}
            className="relative flex min-h-dvh w-full max-w-web flex-col bg-surface desktop:pl-48"
          >
            <AppProviders>{children}</AppProviders>
          </main>
        </div>
      </body>
    </html>
  );
}
