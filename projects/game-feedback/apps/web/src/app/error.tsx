'use client';
import { Button } from '@side/design-system';
export default function ErrorPage({ reset: handleReset }: { reset: () => void }) {
  return (
    <div className="standalone-state">
      <h1>잠시 플레이를 멈췄어요</h1>
      <p>화면을 불러오는 중 문제가 생겼습니다.</p>
      <Button variant="primary" size="md" type="submit" className="button dark" onClick={handleReset}>
        다시 시도하기
      </Button>
    </div>
  );
}
