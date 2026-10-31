import { renderToString } from 'react-dom/server';

import { render, screen, waitFor } from '@testing-library/react';
import lottie from 'lottie-web/build/player/lottie_light';
import { describe, expect, it, vi } from 'vitest';

import { StatusAnimation } from './StatusAnimation';

describe('StatusAnimation', () => {
  it('서버 HTML에서 정지 그림과 접근성 이름을 제공하고 플레이어를 시작하지 않아야 한다', () => {
    const count = vi.mocked(lottie.loadAnimation).mock.calls.length;
    const html = renderToString(<StatusAnimation variant="empty" label="등록한 사진이 없어요" />);
    expect(html).toContain('등록한 사진이 없어요');
    expect(html).toContain('data-motion-fallback');
    expect(vi.mocked(lottie.loadAnimation).mock.calls).toHaveLength(count);
  });

  it('컴포넌트가 사라지면 로드한 플레이어와 구독을 정리해야 한다', async () => {
    const { unmount } = render(<StatusAnimation variant="success" label="저장 완료" />);
    expect(screen.getByRole('img', { name: '저장 완료' })).toBeInTheDocument();
    await waitFor(() => expect(lottie.loadAnimation).toHaveBeenCalled());
    const result = vi.mocked(lottie.loadAnimation).mock.results.at(-1)?.value;
    unmount();
    expect(result?.destroy).toHaveBeenCalledOnce();
  });
});
