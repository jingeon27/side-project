import { MockedProvider } from '@apollo/client/testing/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it } from 'vitest';

import { BottomSheet } from '@/shared/ui/@core/bottom-sheet';

import { PostCommentsHeader } from './PostCommentsHeader';

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('PostCommentsHeader', () => {
  it('댓글 시트는 제목 옆에 닫기 버튼을 두지 않고 Esc로 닫으면 연 버튼으로 포커스를 돌려야 한다', async () => {
    const user = userEvent.setup();
    render(
      <MockedProvider>
        <OverlayProvider>
          <button
            type="button"
            onClick={() =>
              overlay.open(({ isOpen, close: onClose, unmount }) => (
                <BottomSheet.Root isOpen={isOpen} onClose={onClose} unmount={unmount} snapPoints={[0.75, 1]}>
                  <PostCommentsHeader postId="post-1" />
                </BottomSheet.Root>
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
    const sheet = await screen.findByRole('dialog', { name: '댓글' });

    expect(within(sheet).queryByRole('button', { name: '닫기' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
