import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OverlayProvider } from 'overlay-kit';
import { expect, it, vi } from 'vitest';

import { GroupRole, PostCategoryOptionsDocument } from '@/shared/api/generated';

import { GroupCategoryManager } from './GroupCategoryManager';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const row = (id: string, name: string, position: number) => ({
  __typename: 'GroupCategory' as const,
  id,
  name,
  position,
  archivedAt: null,
});

function ActiveCategoryOptions() {
  useQuery(PostCategoryOptionsDocument, { variables: { id: 'group-1' } });
  return null;
}

it('카테고리 목록을 다시 받는 동안 이어서 입력한 다음 이름을 지우지 않아야 한다', async () => {
  const categories: ReturnType<typeof row>[] = [];
  let release = () => {};
  let gated = false;
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        const respond = (data: Record<string, unknown>) =>
          queueMicrotask(() => {
            sink.next({ data });
            sink.complete();
          });
        const group = { __typename: 'Group', id: 'group-1' };
        if (operation.operationName === 'CreateGroupCategory') {
          categories.push(
            row(`category-${categories.length + 1}`, operation.variables.name, categories.length),
          );
          respond({ createGroupCategory: categories.at(-1) });
          return;
        }
        if (operation.operationName === 'GroupCategories') {
          respond({ group: { ...group, role: GroupRole.Owner, categories: [...categories] } });
          return;
        }
        const options = {
          group: {
            ...group,
            categories: categories.map(({ id, name }) => ({ __typename: 'GroupCategory', id, name })),
          },
        };
        // 다른 화면의 목록 갱신이 늦게 끝나는 상황을 만든다.
        if (!categories.length || gated) {
          respond(options);
          return;
        }
        gated = true;
        release = () => respond(options);
      }),
  );
  const client = new ApolloClient({ cache: new InMemoryCache(), link });
  const user = userEvent.setup();
  await act(async () => {
    render(
      <ApolloProvider client={client}>
        <OverlayProvider>
          <ActiveCategoryOptions />
          <GroupCategoryManager groupId="group-1" />
        </OverlayProvider>
      </ApolloProvider>,
    );
  });
  await user.click(screen.getByText('카테고리 관리'));
  const input = await screen.findByRole('textbox', { name: /새 카테고리/ });
  await user.type(input, '합성');
  await user.click(screen.getByRole('button', { name: '카테고리 만들기' }));
  expect(await screen.findByRole('textbox', { name: /합성 이름/ })).toBeVisible();
  await user.type(input, '순간포착');
  await waitFor(() => expect(gated).toBe(true));
  release();
  await waitFor(() => expect(screen.getByRole('button', { name: '카테고리 만들기' })).toBeEnabled());
  expect(input).toHaveValue('순간포착');
});
