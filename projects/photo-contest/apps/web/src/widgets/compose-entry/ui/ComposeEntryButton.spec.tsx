import { Activity, StrictMode } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupRole, MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { hasOpenOverlay } from '@/shared/model/router';

import { ComposeEntryButton } from './ComposeEntryButton';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

beforeEach(() => {
  navigation.push.mockReset();
  navigation.replace.mockReset();
  navigation.prefetch.mockReset();
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

function renderCompose(groupNames: string[]) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({
    query: MyGroupsDocument,
    data: {
      myGroups: groupNames.map(
        (name, index) =>
          ({
            __typename: 'Group',
            id: `group-${index + 1}`,
            name,
            description: '',
            avatarUrl: null,
            role: GroupRole.Member,
            memberCount: 1,
          }) satisfies MyGroupsQuery['myGroups'][number],
      ),
    },
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <main id="pc-main">
          <ComposeEntryButton hasGroups={groupNames.length > 0} />
        </main>
      </OverlayProvider>
    </ApolloProvider>,
  );
  return userEvent.setup();
}

describe('홈과 탐색의 공통 작성 행동', () => {
  it('참여한 그룹이 없으면 그룹 만들기로 바로 이동해야 한다', async () => {
    const user = renderCompose([]);
    expect(navigation.prefetch).toHaveBeenCalledWith('/groups/new');
    await user.click(screen.getByRole('button', { name: '그룹 만들기' }));
    expect(navigation.push).toHaveBeenCalledWith('/groups/new', undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hasOpenOverlay()).toBe(false);
  });

  it('가입한 그룹이 있으면 두 행동을 보여 주고 그룹 만들기 선택 즉시 이동해야 한다', async () => {
    const user = renderCompose(['우리 웃음']);
    await user.click(screen.getByRole('button', { name: '글쓰기' }));
    const sheet = await screen.findByRole('dialog', { name: '글쓰기' });
    expect(within(sheet).getByRole('button', { name: '게시글 작성' })).toBeVisible();
    await user.click(within(sheet).getByRole('button', { name: '그룹 만들기' }));
    expect(navigation.replace).toHaveBeenCalledWith('/groups/new', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(hasOpenOverlay()).toBe(false);
  });

  it('가입한 그룹이 하나면 게시글 작성 선택 즉시 그 그룹 작성 화면으로 이동해야 한다', async () => {
    const user = renderCompose(['우리 웃음']);
    await user.click(screen.getByRole('button', { name: '글쓰기' }));
    await waitFor(() => expect(navigation.prefetch).toHaveBeenCalledWith('/groups/group-1/write'));
    await user.click(await screen.findByRole('button', { name: '게시글 작성' }));
    expect(navigation.replace).toHaveBeenCalledWith('/groups/group-1/write', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(hasOpenOverlay()).toBe(false);
  });

  it('그룹이 여러 개면 그룹을 선택하는 즉시 해당 작성 화면으로 이동해야 한다', async () => {
    const user = renderCompose(['우리 웃음', '주말 산책']);
    await user.click(screen.getByRole('button', { name: '글쓰기' }));
    const choices = await screen.findByRole('dialog', { name: '글쓰기' });
    await user.click(await screen.findByRole('button', { name: '게시글 작성' }));
    const sheet = await screen.findByRole('dialog', { name: '게시글을 올릴 그룹' });
    expect(sheet).not.toBe(choices);
    expect(choices).toBeInTheDocument();
    await waitFor(() => expect(within(sheet).getByRole('button', { name: '우리 웃음' })).toHaveFocus());
    expect(navigation.prefetch).not.toHaveBeenCalledWith('/groups/group-1/write');
    expect(navigation.prefetch).not.toHaveBeenCalledWith('/groups/group-2/write');
    expect(navigation.replace).not.toHaveBeenCalled();
    await user.click(within(sheet).getByRole('button', { name: '주말 산책' }));
    expect(navigation.replace).toHaveBeenCalledWith('/groups/group-2/write', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(hasOpenOverlay()).toBe(false);
  });

  it('그룹 선택 중 Esc는 첫 작성 시트로 돌아가고 한 번 더 누르면 글쓰기 버튼으로 포커스를 돌려야 한다', async () => {
    const user = renderCompose(['우리 웃음', '주말 산책']);
    const opener = screen.getByRole('button', { name: '글쓰기' });
    await user.click(opener);
    const choices = await screen.findByRole('dialog', { name: '글쓰기' });
    const postChoice = within(choices).getByRole('button', { name: '게시글 작성' });
    await user.click(postChoice);
    await screen.findByRole('dialog', { name: '게시글을 올릴 그룹' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '게시글을 올릴 그룹' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '글쓰기' })).toBe(choices);
    await waitFor(() => expect(postChoice).toHaveFocus());
    expect(hasOpenOverlay()).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(hasOpenOverlay()).toBe(false);
  });

  it('두 시트의 뒤로 가기는 그룹 선택부터 닫고 첫 시트와 버튼 포커스를 복원해야 한다', async () => {
    const user = renderCompose(['우리 웃음', '주말 산책']);
    const opener = screen.getByRole('button', { name: '글쓰기' });
    await user.click(opener);
    const choices = await screen.findByRole('dialog', { name: '글쓰기' });
    await waitFor(() => expect(hasOpenOverlay()).toBe(true));
    const beforeSelection = window.history.length;
    const postChoice = within(choices).getByRole('button', { name: '게시글 작성' });
    await user.click(postChoice);
    await screen.findByRole('dialog', { name: '게시글을 올릴 그룹' });
    await waitFor(() => expect(window.history.length).toBe(beforeSelection + 1));
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '게시글을 올릴 그룹' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '글쓰기' })).toBe(choices);
    await waitFor(() => expect(postChoice).toHaveFocus());
    expect(hasOpenOverlay()).toBe(true);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(hasOpenOverlay()).toBe(false);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('뒤로 가기는 페이지 이동 없이 시트를 먼저 닫아야 한다', async () => {
    const user = renderCompose(['우리 웃음']);
    const opener = screen.getByRole('button', { name: '글쓰기' });
    await user.click(opener);
    await screen.findByRole('dialog', { name: '글쓰기' });
    await waitFor(() => expect(hasOpenOverlay()).toBe(true));
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    expect(navigation.push).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(hasOpenOverlay()).toBe(false);
  });

  it('StrictMode 재연결 후에도 스크롤 정지를 기다리고 제거할 때 타이머와 구독을 정리해야 한다', () => {
    vi.useFakeTimers();
    try {
      const view = render(
        <StrictMode>
          <ComposeEntryButton hasGroups={false} />
        </StrictMode>,
      );
      const button = screen.getByRole('button', { name: '그룹 만들기' });
      fireEvent.scroll(window);
      expect(button).toHaveAttribute('data-compact', 'true');
      act(() => vi.advanceTimersByTime(179));
      fireEvent.scroll(window);
      act(() => vi.advanceTimersByTime(179));
      expect(button).toHaveAttribute('data-compact', 'true');
      act(() => vi.advanceTimersByTime(1));
      expect(button).toHaveAttribute('data-compact', 'false');
      fireEvent.scroll(window);
      view.unmount();
      fireEvent.scroll(window);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Activity가 스크롤 중인 홈을 숨겼다가 다시 보여 주면 추가 스크롤 없이 글자를 펼쳐야 한다', () => {
    vi.useFakeTimers();
    try {
      const view = render(
        <Activity mode="visible">
          <ComposeEntryButton hasGroups={false} />
        </Activity>,
      );
      const button = screen.getByRole('button', { name: '그룹 만들기' });
      fireEvent.scroll(window);
      expect(button).toHaveAttribute('data-compact', 'true');
      view.rerender(
        <Activity mode="hidden">
          <ComposeEntryButton hasGroups={false} />
        </Activity>,
      );
      fireEvent.scroll(window);
      expect(vi.getTimerCount()).toBe(0);
      view.rerender(
        <Activity mode="visible">
          <ComposeEntryButton hasGroups={false} />
        </Activity>,
      );
      expect(screen.getByRole('button', { name: '그룹 만들기' })).toBe(button);
      expect(button).toHaveAttribute('data-compact', 'true');
      act(() => vi.advanceTimersByTime(179));
      expect(button).toHaveAttribute('data-compact', 'true');
      act(() => vi.advanceTimersByTime(1));
      expect(button).toHaveAttribute('data-compact', 'false');
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
