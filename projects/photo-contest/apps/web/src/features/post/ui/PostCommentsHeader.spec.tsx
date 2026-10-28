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
  it('하단 취소가 없는 댓글 시트를 제목 옆의 보이는 닫기 버튼으로 닫아야 한다', async () => {
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

    await user.click(within(sheet).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
