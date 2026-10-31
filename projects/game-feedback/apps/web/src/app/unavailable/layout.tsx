import type { Metadata } from 'next';

import '@/_app/styles/tailwind.css';

export const metadata: Metadata = { title: '페이지를 찾을 수 없습니다 | Game Mate' };

export default function UnavailableLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
