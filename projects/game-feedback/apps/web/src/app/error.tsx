'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="standalone-state">
      <h1>잠시 플레이를 멈췄어요</h1>
      <p>화면을 불러오는 중 문제가 생겼습니다.</p>
      <button className="button dark" onClick={reset}>
        다시 시도하기
      </button>
    </div>
  );
}
