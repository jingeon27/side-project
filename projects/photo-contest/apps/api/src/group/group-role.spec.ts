import { describe, expect, it } from 'vitest';

import { GROUP_ROLE, isAdmin, isOwner, toGroupRole } from './group-role';

describe('그룹 운영 권한', () => {
  it.each([
    [GROUP_ROLE.OWNER, true, true],
    [GROUP_ROLE.MODERATOR, true, false],
    [GROUP_ROLE.MEMBER, false, false],
    ['ADMIN', false, false],
    ['', false, false],
  ])('%s 역할의 운영·양도 권한을 구분해야 한다', (role, admin, owner) => {
    expect(isAdmin({ role })).toBe(admin);
    expect(isOwner({ role })).toBe(owner);
  });
  it('모르는 역할에는 일반 멤버 권한만 부여해야 한다', () => {
    expect(toGroupRole('SUPERUSER')).toBe(GROUP_ROLE.MEMBER);
    expect(toGroupRole(GROUP_ROLE.MODERATOR)).toBe(GROUP_ROLE.MODERATOR);
  });
});
