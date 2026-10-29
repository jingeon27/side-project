import { expect, it } from 'vitest';

import { adminSupportListPath, parseAdminRoute } from './admin-route';

it('잘못된 상태만 기본값으로 복구하고 유효한 문의를 유지해야 한다', () => {
  expect(parseAdminRoute('#support?thread=thread-1&status=invalid')).toMatchObject({
    threadId: 'thread-1',
    supportStatus: 'ALL',
  });
});

it('필터 변경은 선택한 문의와 관련 없는 매개변수를 보존해야 한다', () => {
  const current = '#support?thread=thread-1&status=invalid&view=compact&tag=a&tag=b';
  expect(adminSupportListPath('ALL', '#support?note=first?second')).toBe('#support?note=first%3Fsecond');
  const closed = adminSupportListPath('CLOSED', current);
  expect(closed).toBe('#support?thread=thread-1&view=compact&tag=a&tag=b&status=CLOSED');
  expect(adminSupportListPath('ALL', closed)).toBe('#support?thread=thread-1&view=compact&tag=a&tag=b');
});
