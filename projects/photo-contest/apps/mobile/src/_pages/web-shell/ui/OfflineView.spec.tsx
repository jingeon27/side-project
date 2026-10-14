import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OfflineView } from './OfflineView';

describe('OfflineView', () => {
  it('연결 안내와 다시 시도 버튼을 보여 주고, 누르면 onRetry를 불러야 한다', () => {
    const onRetry = vi.fn();
    render(<OfflineView onRetry={onRetry} />);

    expect(screen.getByRole('heading', { name: '연결할 수 없어요' })).toBeTruthy();
    expect(screen.getByText('인터넷 연결을 확인한 뒤 다시 시도해 주세요.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
