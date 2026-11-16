import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { GroupCategoryService } from './categories/group-category.service';

const CREATE_CATEGORY =
  'mutation($groupId:ID!,$name:String!){createGroupCategory(groupId:$groupId,name:$name){id}}';
const DISCOVER =
  'query($search:String!){discoverGroups(search:$search,limit:48){id visibility categories{name}}}';

interface IDiscovered {
  id: string;
  visibility: string;
  categories: Array<{ name: string }>;
}

describe('GroupService 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('카테고리묶음-그룹장');
  });

  afterAll(async () => {
    await api?.close();
  });

  it('익명 discoverGroups의 카테고리는 그룹 수와 관계없이 한 번에 읽어야 한다', async () => {
    // 그룹마다 카테고리 조회(권한 확인 포함 3번)가 따로 실행돼 alias와 곱해지면 DB 풀이 고갈됐다.
    const publicIds: string[] = [];
    for (let index = 0; index < 3; index++) {
      const group = await createGroup(api, owner, `카테고리묶음 공개 ${index}`);
      await api.gqlOk(owner.cookie, CREATE_CATEGORY, { groupId: group.id, name: `분류 ${index}` });
      publicIds.push(group.id);
    }
    const hidden = await createGroup(api, owner, '카테고리묶음 비공개', [], 'PRIVATE');
    await api.gqlOk(owner.cookie, CREATE_CATEGORY, { groupId: hidden.id, name: '비공개 분류' });

    const activeOf = vi.spyOn(api.app.get(GroupCategoryService), 'activeOf');
    const { discoverGroups } = await api.gqlOk<{ discoverGroups: IDiscovered[] }>(undefined, DISCOVER, {
      search: '카테고리묶음',
    });
    expect(activeOf).toHaveBeenCalledTimes(1);
    expect(activeOf.mock.calls[0]?.[0]).toEqual(expect.arrayContaining(publicIds));
    expect(activeOf.mock.calls[0]?.[0]).not.toContain(hidden.id);
    expect(discoverGroups).toHaveLength(4);
    for (const group of discoverGroups)
      expect(group.categories.map(({ name }) => name)).toEqual(
        group.id === hidden.id ? [] : [`분류 ${publicIds.indexOf(group.id)}`],
      );
  });
});
