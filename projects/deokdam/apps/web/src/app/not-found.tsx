import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main-content" className="site-width reading-width inner-page">
      <div className="empty-state">
        <h1>페이지를 찾지 못했어요</h1>
        <Link href="/#stories" className="action-link">
          이야기 모아보기
        </Link>
      </div>
    </main>
  );
}
