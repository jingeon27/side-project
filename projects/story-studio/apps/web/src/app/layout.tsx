import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '장면 | 한국어 AI 창작 스튜디오',
  description: '작은 아이디어에서 영화, 드라마, 애니메이션, 웹툰, 소설까지. 한국어로 만드는 나만의 이야기.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
