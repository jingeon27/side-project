import { StrictMode } from 'react';

import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EMPTY, of, Subject, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/shared/model/toast';

import { CreatePostForm } from './CreatePostForm';
import { PostMediaPreview } from './PostMediaPreview';

const TICKET = {
  __typename: 'PostUploadTicket',
  id: 'upload-1',
  url: 'https://storage.test/upload',
  fields: [{ __typename: 'UploadFormField', name: 'key', value: 'media/upload-1.png' }],
  expiresAt: '2026-10-22T00:15:00.000Z',
} as const;

const createUrl = vi.fn<(file: Blob) => string>();
const revokeUrl = vi.fn<(url: string) => void>();
const pause = vi.fn();
const photo = (name = 'moment.png') => new File(['photo'], name, { type: 'image/png' });
const video = () => new File(['video'], 'clip.mp4', { type: 'video/mp4' });

beforeEach(() => {
  createUrl.mockReset().mockImplementation(() => `blob:preview-${createUrl.mock.calls.length}`);
  revokeUrl.mockReset();
  pause.mockReset();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createUrl;
      static override revokeObjectURL = revokeUrl;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openForm() {
  const user = userEvent.setup({ applyAccept: false });
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  const view = render(
    <StrictMode>
      <ApolloProvider client={client}>
        <CreatePostForm groupId="gallery" onCreated={() => {}} />
      </ApolloProvider>
    </StrictMode>,
  );
  await screen.findByRole('form', { name: '그룹에 글쓰기' });
  return { user, ...view, input: screen.getByLabelText('사진·동영상 선택') };
}

describe('선택한 게시물 파일 미리보기', () => {
  it('사진·동영상으로 바꾸고 제거하면 미리보기와 폼 값이 함께 바뀌어야 한다', async () => {
    const { user, input } = await openForm();
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
    const { user, input, unmount } = await openForm();
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
    unmount();
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: '그룹에 글쓰기' })).not.toBeInTheDocument(),
    );
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview-2');
    await openForm();
    expect(screen.queryByRole('figure', { name: '선택한 파일 미리보기' })).not.toBeInTheDocument();
  });

  it('지원하지 않는 형식과 큰 파일은 선택 즉시 알리고 미리보기를 만들지 않아야 한다', async () => {
    const { user, input } = await openForm();
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
    const { input, unmount } = await openForm();
    act(() => {
      fireEvent.change(input, { target: { files: [photo('first.png')] } });
      fireEvent.change(input, { target: { files: [photo('second.png')] } });
    });
    const image = await screen.findByRole('img', { name: '선택한 사진 미리보기' });
    const activeUrl = image.getAttribute('src');
    expect(activeUrl).toMatch(/^blob:/);
    expect(revokeUrl).not.toHaveBeenCalledWith(activeUrl);
    unmount();
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: '그룹에 글쓰기' })).not.toBeInTheDocument(),
    );
    for (const result of createUrl.mock.results) expect(revokeUrl).toHaveBeenCalledWith(result.value);
  });
});

/**
 * 게시 단계까지 채운 폼. 업로드 요청은 티켓을, 업로드 완료는 completeUpload를 응답으로 주고
 * 모든 연산 이름을 operationNames에 기록한다.
 */
async function fillUploadForm({
  completeUpload = EMPTY,
}: { completeUpload?: Observable<ApolloLink.Result> } = {}) {
  const user = userEvent.setup({ applyAccept: false });
  const operationNames: string[] = [];
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => {
      operationNames.push(operation.operationName ?? '');
      if (operation.operationName === 'RequestPostUpload') return of({ data: { requestPostUpload: TICKET } });
      if (operation.operationName === 'CompletePostUpload') return completeUpload;
      return EMPTY;
    }),
  });
  const view = render(
    <ApolloProvider client={client}>
      <CreatePostForm groupId="gallery" onCreated={() => {}} />
    </ApolloProvider>,
  );
  await screen.findByRole('form', { name: '그룹에 글쓰기' });
  await user.upload(screen.getByLabelText('사진·동영상 선택'), photo());
  await user.type(screen.getByLabelText('제목', { exact: false }), '웃긴 순간');
  await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));
  return { user, client, operationNames, ...view };
}

describe('게시물 업로드 티켓', () => {
  it('서명된 업로드 정책을 Apollo 캐시에 남기지 않아야 한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    const { user, client } = await fillUploadForm();
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    expect(
      await screen.findByText('파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.'),
    ).toBeVisible();
    const cached = JSON.stringify(client.extract());
    expect(cached).not.toContain('PostUploadTicket');
    expect(cached).not.toContain(TICKET.url);
  });
});

describe('업로드 중 글쓰기 페이지 떠나기', () => {
  it('저장소로 올리는 중에 닫으면 전송을 끊고 게시하지 않은 사실을 알려야 한다', async () => {
    const info = vi.spyOn(toast, 'info');
    const send = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', send);
    const { user, operationNames, unmount } = await fillUploadForm();
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    unmount();

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: '그룹에 글쓰기' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(info).toHaveBeenCalledWith('게시물을 올리지 않았어요', expect.anything()));
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(operationNames).not.toContain('CompletePostUpload');
    expect(operationNames).not.toContain('CreatePost');
  });

  it('업로드를 마친 뒤 게시 전에 닫았으면 게시물을 만들지 않아야 한다', async () => {
    const info = vi.spyOn(toast, 'info');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const completeUpload = new Subject<ApolloLink.Result>();
    const { user, operationNames, unmount } = await fillUploadForm({ completeUpload });
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    await waitFor(() => expect(operationNames).toContain('CompletePostUpload'));

    unmount();
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: '그룹에 글쓰기' })).not.toBeInTheDocument(),
    );
    act(() => {
      completeUpload.next({
        data: {
          completePostUpload: {
            __typename: 'PostUploadResult',
            id: TICKET.id,
            kind: 'PHOTO',
            contentType: 'image/png',
            byteSize: 5,
          },
        },
      });
      completeUpload.complete();
    });

    await waitFor(() => expect(info).toHaveBeenCalledWith('게시물을 올리지 않았어요', expect.anything()));
    expect(operationNames).not.toContain('CreatePost');
  });
});
