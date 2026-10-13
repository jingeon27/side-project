import { parseAppUserAgent } from '@photo-contest/bridge';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AppProviders } from '@/modules/app/providers';
import '@/modules/app/styles/tailwind.css';
import { APP_MAIN_ID, APP_ROOT_ID, THEME_COLOR } from '@/modules/shared/constants/layout';

export const metadata: Metadata = {
  title: { default: '웃긴순간 — 우리끼리 사진 대회', template: '%s · 웃긴순간' },
  description: '친구들과 비공개 사진 대회를 열고 최고의 순간을 뽑아보세요.',
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
        {/* 데스크톱에서도 앱 WebView와 같은 가운데 휴대폰 열 하나로 보여 준다. */}
        <div id={APP_ROOT_ID} className="flex min-h-dvh justify-center bg-canvas">
          <main
            id={APP_MAIN_ID}
            className="relative flex min-h-dvh w-full max-w-app flex-col bg-surface shadow-app"
          >
            <AppProviders>{children}</AppProviders>
          </main>
        </div>
      </body>
    </html>
  );
}
