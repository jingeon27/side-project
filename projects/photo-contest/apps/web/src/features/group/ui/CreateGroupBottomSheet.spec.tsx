import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CreateGroupDocument,
  GroupRole,
  MyGroupsDocument,
  type GroupCardFragment,
} from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';

import { CreateGroupBottomSheet } from './CreateGroupBottomSheet';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const group = (id: string, name: string): GroupCardFragment => ({
  __typename: 'Group',
  id,
  name,
  role: GroupRole.Owner,
  members: [{ __typename: 'Member', role: GroupRole.Owner, user: { __typename: 'User', id: 'user-1' } }],
});

function renderSheet(mocks: MockLink.MockedResponse[] = []) {
  const user = userEvent.setup();
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) });
  client.writeQuery({ query: MyGroupsDocument, data: { myGroups: [group('group-old', '예전 그룹')] } });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <CreateGroupBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />
            ))
          }
        >
          그룹 만들기
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  return { user, client, opener: screen.getByRole('button', { name: '그룹 만들기' }) };
}

const navigatedTo = () => [...router.push.mock.calls, ...router.replace.mock.calls].map(([href]) => href);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('CreateGroupBottomSheet', () => {
  it('빈 이름을 제출하면 오류를 보여 주고 요청하지 않아야 한다', async () => {
    const { user, opener } = renderSheet();
    await user.click(opener);
    const sheet = await screen.findByRole('dialog', { name: '그룹 만들기' });

    await user.click(screen.getAllByRole('button', { name: '그룹 만들기' }).at(-1) ?? sheet);

    expect(await screen.findByText('그룹 이름을 입력해 주세요.')).toBeVisible();
    expect(screen.getByLabelText('그룹 이름')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('그룹 이름'), '웃음 메이트');
    expect(screen.getByLabelText('그룹 이름')).toHaveValue('웃음 메이트');
    expect(navigatedTo()).toEqual([]);
  });

  it('Escape로 닫으면 시트를 연 버튼으로 포커스가 돌아가야 한다', async () => {
    const { user, opener } = renderSheet();
    await user.click(opener);
    await screen.findByRole('dialog', { name: '그룹 만들기' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each(['PUBLIC', 'PRIVATE'])(
    '%s 그룹을 만들면 MY 목록에 넣고 새 그룹 화면으로 가야 한다',
    async (visibility) => {
      const created = group('group-new', '웃음 연구소');
      const { user, opener, client } = renderSheet([
        {
          request: { query: CreateGroupDocument, variables: { name: '웃음 연구소', visibility } },
          result: { data: { createGroup: created } },
        },
      ]);
      await user.click(opener);
      const sheet = await screen.findByRole('dialog', { name: '그룹 만들기' });

      await user.type(screen.getByLabelText('그룹 이름'), '  웃음 연구소  ');
      expect(screen.getByRole('radio', { name: /^공개 그룹/ })).toBeChecked();
      if (visibility === 'PRIVATE') await user.click(screen.getByRole('radio', { name: /^비공개 그룹/ }));
      await user.click(within(sheet).getByRole('button', { name: '그룹 만들기' }));

      await waitFor(() => expect(navigatedTo()).toEqual(['/groups/group-new']));
      expect(trackEvent).toHaveBeenCalledWith('group_created', { group_id: 'group-new' });
      expect(client.readQuery({ query: MyGroupsDocument })?.myGroups.map((item) => item.id)).toEqual([
        'group-new',
        'group-old',
      ]);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    },
  );
});
