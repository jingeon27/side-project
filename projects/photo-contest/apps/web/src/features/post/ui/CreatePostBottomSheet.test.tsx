import { StrictMode } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreatePostBottomSheet } from './CreatePostBottomSheet';
import { PostMediaPreview } from './PostMediaPreview';

const createUrl = vi.fn<(file: Blob) => string>();
const revokeUrl = vi.fn<(url: string) => void>();
const pause = vi.fn();
const photo = (name = 'moment.png') => new File(['photo'], name, { type: 'image/png' });
const video = () => new File(['video'], 'clip.mp4', { type: 'video/mp4' });

beforeEach(() => {
  let sequence = 0;
  createUrl.mockReset().mockImplementation(() => `blob:preview-${++sequence}`);
  revokeUrl.mockReset();
  pause.mockReset();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
});

afterEach(() => {
  act(() => overlay.unmountAll());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openSheet() {
  const user = userEvent.setup({ applyAccept: false });
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  render(
    <StrictMode>
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
      </ApolloProvider>
    </StrictMode>,
  );
  await user.click(screen.getByRole('button', { name: '글쓰기' }));
  await screen.findByRole('dialog', { name: '그룹에 글쓰기' });
  return { user, input: screen.getByLabelText('사진·동영상 선택') };
}

describe('선택한 게시물 파일 미리보기', () => {
  it('사진·동영상으로 바꾸고 제거하면 미리보기와 폼 값이 함께 바뀌어야 한다', async () => {
    const { user, input } = await openSheet();
    const first = photo();
    await user.upload(input, first);
    expect(await screen.findByRole('img', { name: '선택한 사진 미리보기' })).toHaveAttribute(
      'src',
      'blob:preview-1',
    );
    expect(createUrl).toHaveBeenCalledWith(first);
    await user.upload(input, video());
    const player = await screen.findByLabelText('선택한 동영상 미리보기');
    expect(player).toHaveAttribute('src', 'blob:preview-2');
    expect(player).toHaveAttribute('controls');
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-1');
    await user.upload(input, photo('other.png'));
    expect(await screen.findByRole('img', { name: '선택한 사진 미리보기' })).toHaveAttribute(
      'src',
      'blob:preview-3',
    );
    expect(pause).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-2');
    await user.click(screen.getByRole('button', { name: '선택한 파일 제거' }));
    expect(await screen.findByText('사진·동영상 또는 링크를 첨부해 주세요.')).toBeVisible();
    expect(screen.queryByRole('figure', { name: '선택한 파일 미리보기' })).not.toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-3');
  });

  it('선택 취소는 기존 파일을 유지하고 같은 파일도 다시 선택하며 닫으면 정리해야 한다', async () => {
    const { user, input } = await openSheet();
    const file = photo();
    await user.upload(input, file);
    const image = await screen.findByRole('img', { name: '선택한 사진 미리보기' });
    fireEvent.change(input, { target: { files: [] } });
    expect(image).toHaveAttribute('src', 'blob:preview-1');
    expect(revokeUrl).not.toHaveBeenCalled();
    await user.upload(input, file);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: '선택한 사진 미리보기' })).toHaveAttribute(
        'src',
        'blob:preview-2',
      ),
    );
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-1');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-2');
    await user.click(screen.getByRole('button', { name: '글쓰기' }));
    await screen.findByRole('dialog', { name: '그룹에 글쓰기' });
    expect(screen.queryByRole('figure', { name: '선택한 파일 미리보기' })).not.toBeInTheDocument();
  });

  it('지원하지 않는 형식과 큰 파일은 선택 즉시 알리고 미리보기를 만들지 않아야 한다', async () => {
    const { user, input } = await openSheet();
    await user.upload(input, new File(['text'], 'note.txt', { type: 'text/plain' }));
    expect(await screen.findByText('사진 또는 MP4·WebM 동영상을 선택해 주세요.')).toBeVisible();
    expect(createUrl).not.toHaveBeenCalled();
    const large = photo();
    Object.defineProperty(large, 'size', { value: 100 * 1024 * 1024 + 1 });
    await user.upload(input, large);
    expect(await screen.findByText('100MB 이하로 선택해 주세요.')).toBeVisible();
    expect(createUrl).not.toHaveBeenCalled();
    await user.upload(input, photo());
    expect(await screen.findByRole('img', { name: '선택한 사진 미리보기' })).toBeVisible();
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'false'));
  });

  it('디코드 실패를 알리고 새 파일을 선택하면 실패한 미리보기를 교체해야 한다', async () => {
    const view = render(
      <PostMediaPreview file={photo()} src="blob:first" onReplace={() => {}} onRemove={() => {}} />,
    );
    fireEvent.error(await screen.findByRole('img', { name: '선택한 사진 미리보기' }));
    expect(await screen.findByText(/미리보기를 열 수 없어요/)).toBeVisible();
    view.rerender(
      <PostMediaPreview
        key="next"
        file={video()}
        src="blob:second"
        onReplace={() => {}}
        onRemove={() => {}}
      />,
    );
    const player = await screen.findByLabelText('선택한 동영상 미리보기');
    fireEvent.loadedData(player);
    expect(screen.queryByText(/미리보기를 열 수 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByText('미리보기 불러오는 중')).not.toBeInTheDocument();
    view.unmount();
    expect(pause).toHaveBeenCalled();
  });

  it('StrictMode에서 빠르게 파일을 바꿔도 표시 중인 주소를 유지하고 모두 정리해야 한다', async () => {
    const { user, input } = await openSheet();
    act(() => {
      fireEvent.change(input, { target: { files: [photo('first.png')] } });
      fireEvent.change(input, { target: { files: [photo('second.png')] } });
    });
    const image = await screen.findByRole('img', { name: '선택한 사진 미리보기' });
    const activeUrl = image.getAttribute('src');
    expect(activeUrl).toMatch(/^blob:/);
    expect(revokeUrl).not.toHaveBeenCalledWith(activeUrl);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    for (const result of createUrl.mock.results) expect(revokeUrl).toHaveBeenCalledWith(result.value);
  });
});
