import { afterAll, beforeAll, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { contestSchedule, CREATE_CONTEST, createContest, createGroup } from '../../test/support/fixtures';

const state: { api?: ITestApi } = {};
beforeAll(async () => {
  state.api = await createTestApp();
});
afterAll(async () => {
  await state.api?.close();
});

it('그룹장도 새 구대회를 만들지 못하고 기존 대회는 계속 조회할 수 있다', async () => {
  const api = state.api;
  if (!api) throw new Error('Missing test application');
  const owner = await api.signIn('구대회 종료 관리자');
  const member = await api.signIn('구대회 종료 멤버');
  const group = await createGroup(api, owner, '구대회 유지', [member]);
  const before = await api.db.contest.count({ where: { groupId: group.id } });
  const variables = { groupId: group.id, title: '생성 금지', ...contestSchedule() };
  expect(await api.gqlFail(owner.cookie, CREATE_CONTEST, variables)).toEqual({
    code: 'FORBIDDEN',
    message: '기존 대회는 새로 만들 수 없습니다. 그룹 대회를 이용해 주세요.',
  });
  expect(await api.gqlFail(member.cookie, CREATE_CONTEST, variables)).toMatchObject({ code: 'FORBIDDEN' });
  expect(await api.db.contest.count({ where: { groupId: group.id } })).toBe(before);
  const id = await createContest(api, owner, group.id, '기존 구대회');
  expect(
    await api.gqlOk(member.cookie, 'query($id: ID!) { contest(id: $id) { id title phase } }', { id }),
  ).toEqual({
    contest: { id, title: '기존 구대회', phase: 'SUBMISSION' },
  });
});
