// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

import { pushOverlayEntry, releaseOverlayEntry } from '../model/router/overlay-history.store';
import { reloadDocument } from './document-navigation.helper';

it('계정이 바뀌면 hash가 있는 현재 주소도 새 문서로 받고 오버레이 정리가 재로딩을 취소하지 않아야 한다', () => {
  window.history.replaceState({}, '', '/me#profile');
  const key = pushOverlayEntry(vi.fn());
  const back = vi.spyOn(window.history, 'back');
  const location = { reload: vi.fn() };
  try {
    reloadDocument(location);
    releaseOverlayEntry(key);
    expect(location.reload).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#profile');
  } finally {
    back.mockRestore();
    window.history.replaceState({}, '', '/');
  }
});
