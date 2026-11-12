import { describe, expect, it } from 'vitest';

import { getSafeNextPath } from './login-redirect.helper';

describe('getSafeNextPath', () => {
  it('next가 반복돼 배열로 들어오면 오류 없이 홈으로 보내야 한다', () => {
    // `/sign?next=/a&next=/b`의 searchParams.next
    expect(getSafeNextPath(['/groups/1', '/me'])).toBe('/');
  });
});
