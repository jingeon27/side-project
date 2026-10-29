import { act, renderHook } from '@testing-library/react';
import { addEventListener } from 'expo-linking';
import { describe, expect, it, vi } from 'vitest';

import { useDeepLinkEvents } from './use-deep-link-events';

describe('useDeepLinkEvents', () => {
  it('다시 구독하지 않고 최신 콜백으로 링크를 열고 해제 시 리스너를 제거해야 한다', () => {
    const remove = vi.fn();
    vi.mocked(addEventListener).mockReturnValue({ remove });
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender, unmount } = renderHook(({ onOpen }) => useDeepLinkEvents(onOpen), {
      initialProps: { onOpen: first },
    });
    rerender({ onOpen: latest });
    act(() => {
      vi.mocked(addEventListener).mock.calls[0]?.[1]({ url: 'photocontest://groups/4' });
    });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith('/groups/4');
    expect(addEventListener).toHaveBeenCalledOnce();
    unmount();
    expect(remove).toHaveBeenCalledOnce();
  });
});
