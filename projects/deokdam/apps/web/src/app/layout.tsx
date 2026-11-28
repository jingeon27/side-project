import type { Metadata } from 'next';

import { siteOrigin } from '@/shared/site';
import { Providers } from '@/shared/ui/Providers';
import { SiteHeader } from '@/shared/ui/SiteHeader';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: '덕담집 · AI 사주와 오늘의 덕담', template: '%s | 덕담집' },
  description: '취업과 대입을 기다리는 오늘, 내 사주를 읽고 작은 덕을 기록해요.',
  icons: { icon: '/images/deokdam-mark.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main-content">
          본문으로 건너뛰기
        </a>
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
