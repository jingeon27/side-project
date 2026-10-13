import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="empty">
      <h1>페이지를 찾을 수 없어요</h1>
      <Link className="button button-primary" href="/">
        내 그룹으로 돌아가기
      </Link>
    </div>
  );
}
