import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { SET_MODERATOR } from '../../test/support/group-contest';

const MEMBERS =
  'query($id:ID!,$offset:Int,$limit:Int){group(id:$id){memberCount members(offset:$offset,limit:$limit){role user{id}}}}';

interface IMembersPage {
  group: { memberCount: number; members: Array<{ role: string; user: { id: string } }> };
}

describe('그룹 멤버 목록 페이지', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let members: ITestUser[];
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('멤버페이지-그룹장');
    members = [];
    for (const name of ['첫째', '둘째', '셋째', '넷째']) members.push(await api.signIn(`멤버페이지-${name}`));
    groupId = (await createGroup(api, owner, '멤버 페이지 그룹', members)).id;
    // 가장 늦게 가입한 멤버를 부관리자로 둔다. 관리자는 가입 순서와 상관없이 앞에 온다.
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: groupId, user: members[3]?.id, enabled: true });
  });

  afterAll(async () => {
    await api?.close();
  });

  const page = async (variables: { offset?: number; limit?: number }) =>
    (await api.gqlOk<IMembersPage>(owner.cookie, MEMBERS, { id: groupId, ...variables })).group;

  it('관리자를 먼저, 같은 역할은 가입 순으로 나눠 주고 전체 수는 memberCount로 알려야 한다', async () => {
    const [first, second, third, fourth] = members;
    const head = await page({ limit: 2 });
    expect(head.memberCount).toBe(5);
    expect(head.members).toEqual([
      { role: 'OWNER', user: { id: owner.id } },
      { role: 'MODERATOR', user: { id: fourth?.id } },
    ]);
    expect((await page({ offset: 2, limit: 2 })).members.map(({ user }) => user.id)).toEqual([
      first?.id,
      second?.id,
    ]);
    expect((await page({ offset: 4, limit: 2 })).members.map(({ user }) => user.id)).toEqual([third?.id]);
    expect((await page({})).members).toHaveLength(5);
  });

  it('한 번에 48명을 넘게 요청하거나 잘못된 범위는 거절해야 한다', async () => {
    for (const variables of [{ limit: 49 }, { limit: 0 }, { offset: -1 }])
      expect(await api.gqlFail(owner.cookie, MEMBERS, { id: groupId, ...variables })).toMatchObject({
        code: 'BAD_USER_INPUT',
      });
  });

  it('비멤버는 범위와 상관없이 멤버를 받지 않아야 한다', async () => {
    const outsider = await api.signIn('멤버페이지-외부인');
    expect(
      (await api.gqlOk<IMembersPage>(outsider.cookie, MEMBERS, { id: groupId, limit: 48 })).group,
    ).toEqual({ memberCount: 5, members: [] });
  });
});
