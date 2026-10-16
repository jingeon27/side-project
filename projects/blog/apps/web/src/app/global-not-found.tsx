import Link from 'next/link';
import { siteUrl } from '@/shared/config/site';
export const metadata = {
  metadataBase: siteUrl,
  title: '404 · Engineering Blog',
  robots: { index: false, follow: true },
};
import './globals.css';
export default function GlobalNotFound() {
  return (
    <html lang="ko">
      <body>
        <main id="main-content" className="page-container" style={{ paddingBlock: '6rem' }}>
          <p className="eyebrow">404</p>
          <h1>페이지를 찾을 수 없습니다.</h1>
          <p>This page could not be found.</p>
          <Link href="/ko" className="text-link">
            홈으로 돌아가기 →
          </Link>
        </main>
      </body>
    </html>
  );
}
