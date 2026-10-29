import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PullToRefresh } from '../../src/shared/ui/@core/pull-to-refresh/PullToRefresh';

import '../../src/_app/styles/tailwind.css';

function PullToRefreshExample() {
  const [refreshes, setRefreshes] = useState(0);
  return (
    <PullToRefresh
      onRefresh={async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setRefreshes((count) => count + 1);
      }}
    >
      <h1 style={{ height: 60 }}>당겨서 새로고침</h1>
      <output aria-label="새로고침 횟수">{refreshes}</output>
      <div
        role="region"
        aria-label="내부 스크롤"
        style={{ height: 180, overflow: 'auto', overscrollBehavior: 'contain' }}
      >
        <div style={{ height: 1_500 }}>안쪽 목록</div>
      </div>
      <p style={{ height: 160 }}>당기기 영역</p>
      <label>
        검색어
        <input type="text" />
      </label>
      <div style={{ height: 2_400 }}>긴 피드</div>
    </PullToRefresh>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Component test root is missing.');
createRoot(root).render(
  <StrictMode>
    <PullToRefreshExample />
  </StrictMode>,
);
