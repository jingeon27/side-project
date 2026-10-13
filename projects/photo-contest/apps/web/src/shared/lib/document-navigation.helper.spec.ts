import { describe, expect, it, vi } from 'vitest';

import { navigateDocument } from './document-navigation.helper';

describe('navigateDocument', () => {
  it('주어진 경로로 문서 전체를 이동해야 한다', () => {
    const location = { assign: vi.fn() };
    navigateDocument('/backend/auth/google', location);
    expect(location.assign).toHaveBeenCalledWith('/backend/auth/google');
  });
});
