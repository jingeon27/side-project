import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { UploadPhotoBottomSheet } from './UploadPhotoBottomSheet';

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = () => 'blob:preview';
      static override revokeObjectURL = () => undefined;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => overlay.unmountAll());
});

it('사진을 고른 뒤에는 파일 입력을 화면에 보이는 "사진 바꾸기"로 불러야 한다', async () => {
  const user = userEvent.setup();
  render(
    <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() })}>
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <UploadPhotoBottomSheet
                contestId="contest-1"
                isOpen={isOpen}
                onClose={onClose}
                unmount={unmount}
              />
            ))
          }
        >
          사진 제출하기
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  await user.click(screen.getByRole('button', { name: '사진 제출하기' }));
  await screen.findByRole('dialog', { name: '내 웃긴 순간 제출하기' });
  const input = screen.getByLabelText('사진 선택');

  await user.upload(
    input,
    new File([new Uint8Array([137, 80, 78, 71])], 'moment.png', { type: 'image/png' }),
  );

  expect(await screen.findByRole('img', { name: '고른 사진 미리보기' })).toBeInTheDocument();
  expect(screen.getByText('사진 바꾸기')).toBeVisible();
  expect(input).toHaveAccessibleName('사진 바꾸기');
  expect(screen.queryByLabelText('사진 선택')).not.toBeInTheDocument();
});
