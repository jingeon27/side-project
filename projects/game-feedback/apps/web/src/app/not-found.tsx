import { ButtonLink } from '@side/design-system/next';
export default function NotFound() {
  return (
    <main className="standalone-state">
      <p className="muted">404</p>
      <h1>이 플레이는 찾을 수 없어요</h1>
      <p>주소가 변경되었거나 삭제된 페이지입니다.</p>
      <ButtonLink variant="primary" size="md" className="button dark" href="/ko">
        피드로 돌아가기 →
      </ButtonLink>
    </main>
  );
}
