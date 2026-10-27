// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { pushOverlayEntry, releaseOverlayEntry } from '../model/router/overlay-history.store';
import { navigateDocument } from './document-navigation.helper';

describe('navigateDocument', () => {
  it('로그아웃 문서로 이동할 때 확인창 정리가 진행 중인 이동을 취소하지 않아야 한다', () => {
    const key = pushOverlayEntry(vi.fn());
    const back = vi.spyOn(window.history, 'back');
    const location = { assign: vi.fn() };
    try {
      navigateDocument('/sign', location);
      releaseOverlayEntry(key);
      expect(location.assign).toHaveBeenCalledWith('/sign');
      expect(back).not.toHaveBeenCalled();
    } finally {
      back.mockRestore();
      window.history.replaceState({}, '', '/');
    }
  });

  it('주어진 경로로 문서 전체를 이동해야 한다', () => {
    const location = { assign: vi.fn() };
    navigateDocument('/backend/auth/google', location);
    expect(location.assign).toHaveBeenCalledWith('/backend/auth/google');
  });
});
