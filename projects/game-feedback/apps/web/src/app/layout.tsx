import type { Metadata } from 'next';
import { Providers } from '@/_app';
import '@/_app/styles/globals.css';
export const metadata: Metadata = {
  title: { default: '플레이메이트 · Game Feedback', template: '%s · 플레이메이트' },
  description: '혼자 고민하던 플레이, 함께 풀어보세요. 클래시 로얄 플레이어를 위한 게임 피드백 커뮤니티.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
