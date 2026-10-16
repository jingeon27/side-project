import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="standalone-state">
      <span className="section-eyebrow">404 · OUT OF THE ARENA</span>
      <h1>이 플레이는 찾을 수 없어요</h1>
      <p>주소가 변경되었거나 삭제된 페이지입니다.</p>
      <Link className="button dark" href="/ko">
        라운지로 돌아가기 →
      </Link>
    </main>
  );
}
