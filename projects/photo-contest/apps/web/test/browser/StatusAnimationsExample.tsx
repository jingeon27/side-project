import { useState } from 'react';

import { Button, StatusAnimation } from '@side/design-system';

export function StatusAnimationsExample() {
  const [renderAnimations, setRenderAnimations] = useState(true);
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-title text-ink">상태 애니메이션</h1>
      <Button onClick={() => setRenderAnimations((value) => !value)}>그림 표시 전환</Button>
      {renderAnimations ? (
        <div className="mt-6 grid grid-cols-2 justify-items-center gap-8">
          <StatusAnimation variant="loading" label="불러오는 중" />
          <StatusAnimation variant="success" label="저장 완료" />
          <StatusAnimation variant="error" label="오류 안내" className="text-danger" />
          <StatusAnimation variant="empty" label="빈 목록" />
          <StatusAnimation variant="offline" label="연결 확인" />
          <StatusAnimation variant="game" label="게임 패드" />
          <StatusAnimation
            variant="cat"
            label="고양이"
            className="col-span-2 aspect-5/4 h-auto w-full max-w-app"
          />
        </div>
      ) : null}
      <Button loading className="mt-6">
        저장하는 중
      </Button>
    </main>
  );
}
