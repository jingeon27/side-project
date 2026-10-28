import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CreateGroupDocument,
  GroupRole,
  MyGroupsDocument,
  type GroupCardFragment,
} from '@/shared/api/generated';

import { CreateGroupForm } from './CreateGroupForm';

const group = (id: string): GroupCardFragment => ({
  __typename: 'Group',
  id,
  name: '웃음 연구소',
  description: '',
  avatarUrl: null,
  role: GroupRole.Owner,
  memberCount: 1,
});
function renderForm(mocks: MockLink.MockedResponse[] = []) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [group('old-group')] } });
  const onCreated = vi.fn();
  const onCancel = vi.fn();
  render(
    <ApolloProvider client={client}>
      <CreateGroupForm onCreated={onCreated} onCancel={onCancel} />
    </ApolloProvider>,
  );
  return { client, onCreated, onCancel, user: userEvent.setup() };
}
describe('그룹 생성 페이지의 폼', () => {
  it('이름이 비어 있으면 요청하지 않고 이름 오류를 보여야 한다', async () => {
    const { user, onCreated } = renderForm();
    await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
    expect(await screen.findByText('그룹 이름을 입력해 주세요.')).toBeVisible();
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('그룹 배경 사진 선택')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('그룹 프로필 사진 선택')).toHaveAttribute('type', 'file');
  });
  it('취소는 생성 요청을 보내지 않고 원래 화면으로 돌아가야 한다', async () => {
    const { user, onCancel, onCreated } = renderForm();
    await user.type(screen.getByLabelText('그룹 이름'), '입력 중인 그룹');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it.each(['PUBLIC', 'PRIVATE'])(
    '%s 그룹을 만들면 목록 캐시에 넣고 만들어진 그룹으로 이동해야 한다',
    async (visibility) => {
      const { user, onCreated, client } = renderForm([
        {
          request: {
            query: CreateGroupDocument,
            variables: { name: '웃음 연구소', description: '', visibility },
          },
          result: { data: { createGroup: group('new-group') } },
        },
      ]);
      await user.type(screen.getByLabelText('그룹 이름'), '  웃음 연구소  ');
      if (visibility === 'PRIVATE') await user.click(screen.getByRole('radio', { name: /^비공개 그룹/ }));
      await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-group'));
      expect(client.readQuery({ query: MyGroupsDocument })?.myGroups.map((value) => value.id)).toEqual([
        'new-group',
        'old-group',
      ]);
    },
  );
});
