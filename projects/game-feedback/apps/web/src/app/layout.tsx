import type { Metadata } from 'next';
import { ServiceProviders } from '@/_app/index.server';
import { getSeoConfig } from '@/shared/seo';
import '@/_app/styles/tailwind.css';
export const metadata: Metadata = {
  metadataBase: new URL(getSeoConfig().origin),
  title: { default: '플레이메이트 · Game Feedback', template: '%s · 플레이메이트' },
  description: '클래시 로얄 플레이어를 위한 게임 피드백 커뮤니티.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <ServiceProviders>{children}</ServiceProviders>
      </body>
    </html>
  );
}
