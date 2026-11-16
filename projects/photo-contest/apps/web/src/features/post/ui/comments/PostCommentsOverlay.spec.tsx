import { MockedProvider } from '@apollo/client/testing/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostCommentsDocument } from '@/shared/api/generated';
import { hasOpenOverlay } from '@/shared/model/router';

import { PostCommentsOverlay } from './PostCommentsOverlay';

function stubModalWidth(matches: boolean) {
  const media = Object.assign(new EventTarget(), {
    matches,
    media: '(min-width: 768px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) satisfies MediaQueryList;
  vi.stubGlobal('matchMedia', () => media);
  return media;
}

const COMMENTS_MOCK = {
  request: {
    query: PostCommentsDocument,
    variables: { postId: 'post-1', parentId: null, offset: 0, limit: 24 },
  },
  result: { data: { postComments: [], postCommentCount: 0 } },
  maxUsageCount: 2,
};

async function openOverlay() {
  const user = userEvent.setup();
  render(
    <MockedProvider mocks={[COMMENTS_MOCK]}>
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <PostCommentsOverlay postId="post-1" isOpen={isOpen} onClose={onClose} unmount={unmount} />
            ))
          }
        >
          댓글 보기
        </button>
      </OverlayProvider>
    </MockedProvider>,
  );
  const opener = screen.getByRole('button', { name: '댓글 보기' });
  await user.click(opener);
  const dialog = await screen.findByRole('dialog', { name: '댓글' });
  await waitFor(() => expect(hasOpenOverlay()).toBe(true));
  return { user, opener, dialog };
}

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.unstubAllGlobals();
});

describe('PostCommentsOverlay', () => {
  it('768px보다 좁으면 손잡이가 있고 닫기 버튼이 없는 바텀시트를 보여 줘야 한다', async () => {
    stubModalWidth(false);
    const { dialog } = await openOverlay();

    expect(within(dialog).getByRole('slider', { name: '시트 높이 조절' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
  });

  it('768px부터는 손잡이 없는 모달을 보여 주고 닫기 버튼으로 닫으면 연 버튼으로 포커스를 돌려야 한다', async () => {
    stubModalWidth(true);
    const { dialog, opener, user } = await openOverlay();

    expect(within(dialog).queryByRole('slider')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    await waitFor(() => expect(hasOpenOverlay()).toBe(false));
  });

  it('열린 채 폭이 바뀌면 history 항목을 유지한 채 바텀시트와 모달을 바꿔 보여 줘야 한다', async () => {
    const media = stubModalWidth(false);
    await openOverlay();
    const entries = window.history.length;

    media.matches = true;
    act(() => media.dispatchEvent(new Event('change')));
    const modal = await screen.findByRole('dialog', { name: '댓글' });
    expect(within(modal).getByRole('button', { name: '닫기' })).toBeInTheDocument();
    expect(within(modal).queryByRole('slider')).not.toBeInTheDocument();

    media.matches = false;
    act(() => media.dispatchEvent(new Event('change')));
    const sheet = await screen.findByRole('dialog', { name: '댓글' });
    expect(within(sheet).getByRole('slider', { name: '시트 높이 조절' })).toBeInTheDocument();
    expect(window.history.length).toBe(entries);
    expect(hasOpenOverlay()).toBe(true);
  });
});
