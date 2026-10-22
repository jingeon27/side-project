import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { EMPTY } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreatePostBottomSheet } from './CreatePostBottomSheet';

const operations: string[] = [];

beforeEach(() => {
  operations.length = 0;
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = () => 'blob:clip';
      static override revokeObjectURL = () => undefined;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  // jsdom은 동영상을 열지 않으므로 브라우저가 읽은 메타데이터를 대신한다.
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(5 * 60 + 1);
  vi.spyOn(HTMLMediaElement.prototype, 'src', 'set').mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
  });
});

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CreatePostBottomSheet', () => {
  it('5분이 넘는 동영상은 업로드를 요청하지 않고 파일 칸에 알려야 한다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink((operation) => {
        operations.push(operation.operationName ?? '');
        return EMPTY;
      }),
    });
    render(
      <ApolloProvider client={client}>
        <OverlayProvider>
          <button
            onClick={() =>
              overlay.open(({ isOpen, close, unmount }) => (
                <CreatePostBottomSheet groupId="gallery" isOpen={isOpen} onClose={close} unmount={unmount} />
              ))
            }
          >
            글쓰기
          </button>
        </OverlayProvider>
      </ApolloProvider>,
    );
    await user.click(screen.getByRole('button', { name: '글쓰기' }));
    const dialog = await screen.findByRole('dialog', { name: '그룹에 글쓰기' });
    await user.upload(
      screen.getByLabelText('사진·동영상 선택'),
      new File(['video'], 'long.mp4', { type: 'video/mp4' }),
    );
    await user.type(screen.getByLabelText('제목', { exact: false }), '긴 영상');
    await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    expect(await screen.findByText('5분 이하의 동영상을 선택해 주세요.')).toBeVisible();
    expect(dialog).toBeInTheDocument();
    expect(operations.filter((name) => /Upload|CreatePost/.test(name))).toEqual([]);
  });
});
