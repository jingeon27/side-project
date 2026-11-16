import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { EMPTY, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostKind } from '@/shared/api/generated';
import { ANALYTICS_EVENT, trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';

import { CreatePostForm } from './CreatePostForm';

vi.mock('@/shared/model/analytics', async (original) => ({
  ...(await original<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const operations: string[] = [];
const STAY_NOTICE = '다 올릴 때까지 이 화면에 머물러 주세요.';

const TICKET = {
  __typename: 'PostUploadTicket',
  id: 'upload-1',
  url: 'https://storage.test/upload',
  fields: [],
  expiresAt: '2026-10-22T00:15:00.000Z',
};

const COMPLETED_UPLOAD = {
  __typename: 'PostUploadResult',
  id: TICKET.id,
  kind: PostKind.Photo,
  contentType: 'image/png',
  byteSize: 5,
};

const CREATED_POST = {
  __typename: 'GalleryPost',
  id: 'post-1',
  contestId: null,
  groupId: 'gallery',
  groupName: '웃음 연구소',
  title: '큰 순간',
  body: '',
  kind: PostKind.Photo,
  mediaUrl: '/backend/media/post-1',
  mediaWidth: null,
  mediaHeight: null,
  linkUrl: null,
  createdAt: '2026-10-22T00:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  canDelete: true,
  canModerate: false,
  canInteract: true,
  category: null,
  contest: null,
  author: { __typename: 'User', id: 'author-1', nickname: '작성자', avatar: null },
};

/** 저장소 전송(XHR) 대역. 보낸 요청을 모으고 진행과 응답은 테스트가 보낸다. 끊으면 XHR처럼 abort로 끝난다. */
class StorageRequest extends EventTarget {
  static readonly sent: StorageRequest[] = [];
  readonly upload = new EventTarget();
  status = 0;
  readonly open = vi.fn();
  readonly abort = vi.fn(() => this.finish('abort'));
  readonly send = vi.fn(() => {
    StorageRequest.sent.push(this);
  });
  progress(loaded: number, total: number) {
    this.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded, total }));
  }
  respond(status: number) {
    this.status = status;
    this.finish('load');
  }
  fail() {
    this.finish('error');
  }
  private finish(type: 'load' | 'error' | 'abort') {
    this.dispatchEvent(new Event(type));
    this.dispatchEvent(new Event('loadend'));
  }
}

const sentRequest = (index: number) => {
  const request = StorageRequest.sent[index];
  if (!request) throw new Error('저장소 요청이 있어야 합니다.');
  return request;
};

/** 붙잡아 둔 응답을 보내고 끝낸다. */
const release = (response: Subject<ApolloLink.Result>, data: Record<string, unknown>) =>
  act(() => {
    response.next({ data });
    response.complete();
  });

/**
 * 게시 직전까지 채운 사진 게시물. 업로드 완료와 게시 응답은 붙잡아 두었다가 테스트가 보낸다.
 * `holdTicket`이면 업로드 티켓 응답도 붙잡아 둔다.
 */
async function fillPhotoPost({ holdTicket = false } = {}) {
  const requestUpload = new Subject<ApolloLink.Result>();
  const completeUpload = new Subject<ApolloLink.Result>();
  const createPost = new Subject<ApolloLink.Result>();
  const onCreated = vi.fn();
  const user = userEvent.setup({ applyAccept: false });
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => {
      operations.push(operation.operationName ?? '');
      if (operation.operationName === 'RequestPostUpload')
        return holdTicket ? requestUpload : of({ data: { requestPostUpload: TICKET } });
      if (operation.operationName === 'CompletePostUpload') return completeUpload;
      if (operation.operationName === 'CreatePost') return createPost;
      return EMPTY;
    }),
  });
  render(
    <ApolloProvider client={client}>
      <CreatePostForm groupId="gallery" onCreated={onCreated} />
    </ApolloProvider>,
  );
  await screen.findByRole('form', { name: '그룹에 글쓰기' });
  await user.upload(
    screen.getByLabelText('사진 또는 동영상 선택'),
    new File(['photo'], 'moment.png', { type: 'image/png' }),
  );
  await user.type(screen.getByLabelText('제목', { exact: false }), '큰 순간');
  await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));
  return { user, onCreated, requestUpload, completeUpload, createPost };
}

beforeEach(() => {
  operations.length = 0;
  StorageRequest.sent.length = 0;
  vi.mocked(trackEvent).mockClear();
  vi.spyOn(toast, 'info');
  vi.stubGlobal('XMLHttpRequest', StorageRequest);
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
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CreatePostForm', () => {
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
        <CreatePostForm groupId="gallery" onCreated={() => {}} />
      </ApolloProvider>,
    );
    const dialog = await screen.findByRole('form', { name: '그룹에 글쓰기' });
    await user.upload(
      screen.getByLabelText('사진 또는 동영상 선택'),
      new File(['video'], 'long.mp4', { type: 'video/mp4' }),
    );
    await user.type(screen.getByLabelText('제목', { exact: false }), '긴 영상');
    await user.click(screen.getByRole('checkbox', { name: /공유할 권리/ }));
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    expect(await screen.findByText('5분 이하의 동영상을 선택해 주세요.')).toBeVisible();
    expect(dialog).toBeInTheDocument();
    expect(operations.filter((name) => /Upload|CreatePost/.test(name))).toEqual([]);
  });

  it('파일을 올리는 동안 보낸 비율을 보여 주고 게시를 마칠 때까지 화면에 머물라고 알려야 한다', async () => {
    const { user, onCreated, completeUpload, createPost } = await fillPhotoPost();
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    await waitFor(() => expect(StorageRequest.sent).toHaveLength(1));
    expect(screen.getByText(STAY_NOTICE)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: '올리는 중 0%' })).toHaveAttribute('aria-busy', 'true');

    act(() => sentRequest(0).progress(45, 100));
    expect(screen.getByRole('button', { name: '올리는 중 45%' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '취소' })).toBeEnabled();

    // 저장소 전송을 마쳐도 게시 요청 전에 떠나면 게시가 멈추므로 안내를 거두지 않는다.
    act(() => sentRequest(0).respond(204));
    await waitFor(() => expect(operations).toContain('CompletePostUpload'));
    expect(screen.getByRole('button', { name: '올리는 중 100%' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(STAY_NOTICE)).toBeVisible();
    // 전송을 마치면 게시를 되돌릴 수 없으니 취소를 거둔다.
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();

    release(completeUpload, { completePostUpload: COMPLETED_UPLOAD });
    await waitFor(() => expect(operations).toContain('CreatePost'));
    expect(screen.getByText(STAY_NOTICE)).toBeVisible();

    release(createPost, { createPost: CREATED_POST });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('post-1'));
    await waitFor(() => expect(screen.queryByText(STAY_NOTICE)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '게시물 올리기' })).not.toHaveAttribute('aria-busy');
  });

  it('파일을 올리는 중에 취소하면 전송을 끊고 알림 없이 입력을 남겨 다시 올릴 수 있어야 한다', async () => {
    const { user, onCreated, completeUpload, createPost } = await fillPhotoPost();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    await waitFor(() => expect(StorageRequest.sent).toHaveLength(1));
    act(() => sentRequest(0).progress(30, 100));

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(sentRequest(0).abort).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.PostUploadCancelled, {
      group_id: 'gallery',
      kind: 'PHOTO',
    });
    const submit = screen.getByRole('button', { name: '게시물 올리기' });
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-busy'));
    // 누른 취소 버튼이 사라져도 키보드 위치를 잃지 않게 옆의 제출 버튼으로 옮긴다.
    expect(submit).toHaveFocus();
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    expect(screen.queryByText(STAY_NOTICE)).not.toBeInTheDocument();
    // 실패가 아니라 직접 멈춘 것이라 파일 칸 오류나 창을 닫았다는 알림을 보여 주지 않는다.
    expect(screen.getByLabelText('사진 또는 동영상 선택')).toHaveAttribute('aria-invalid', 'false');
    expect(toast.info).not.toHaveBeenCalled();
    expect(screen.getByLabelText('제목', { exact: false })).toHaveValue('큰 순간');
    expect(operations).not.toContain('CompletePostUpload');

    await user.click(submit);
    await waitFor(() => expect(StorageRequest.sent).toHaveLength(2));
    act(() => sentRequest(1).respond(204));
    await waitFor(() => expect(operations).toContain('CompletePostUpload'));
    release(completeUpload, { completePostUpload: COMPLETED_UPLOAD });
    await waitFor(() => expect(operations).toContain('CreatePost'));
    release(createPost, { createPost: CREATED_POST });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('post-1'));
  });

  it('업로드 티켓을 기다리는 중에 취소해도 취소와 진행 안내를 바로 거두고 한 번만 기록해야 한다', async () => {
    const { user, requestUpload } = await fillPhotoPost({ holdTicket: true });
    await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
    await waitFor(() => expect(operations).toContain('RequestPostUpload'));
    expect(screen.getByRole('button', { name: '올리는 중 0%' })).toHaveAttribute('aria-busy', 'true');

    await user.click(screen.getByRole('button', { name: '취소' }));

    // 티켓 응답이 오지 않아 제출은 끝나지 않았어도 다시 누르거나 머물 이유가 없으니 기다리지 않고 거둔다.
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument();
    expect(screen.queryByText(STAY_NOTICE)).not.toBeInTheDocument();
    const submit = screen.getByRole('button', { name: '게시물 올리기' });
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).toHaveFocus();
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(ANALYTICS_EVENT.PostUploadCancelled, {
      group_id: 'gallery',
      kind: 'PHOTO',
    });

    // 늦게 온 티켓으로 저장소 전송을 시작하지 않고, 실패 알림 없이 입력을 남긴다.
    release(requestUpload, { requestPostUpload: TICKET });
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-busy'));
    expect(StorageRequest.sent).toEqual([]);
    expect(operations).not.toContain('CompletePostUpload');
    expect(toast.info).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('사진 또는 동영상 선택')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('제목', { exact: false })).toHaveValue('큰 순간');
  });

  it.each([
    { failure: '거절', finish: (request: StorageRequest) => request.respond(403) },
    { failure: '연결 실패', finish: (request: StorageRequest) => request.fail() },
  ])(
    '저장소 전송이 $failure로 끝나면 비율과 안내를 거두고 입력을 남긴 채 다시 올릴 수 있어야 한다',
    async ({ finish }) => {
      const { user, onCreated, completeUpload, createPost } = await fillPhotoPost();
      await user.click(screen.getByRole('button', { name: '게시물 올리기' }));
      await waitFor(() => expect(StorageRequest.sent).toHaveLength(1));
      expect(screen.getByText(STAY_NOTICE)).toBeVisible();

      act(() => finish(sentRequest(0)));
      expect(
        await screen.findByText('파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.'),
      ).toBeVisible();
      const submit = screen.getByRole('button', { name: '게시물 올리기' });
      expect(submit).not.toHaveAttribute('aria-busy');
      expect(screen.queryByText(STAY_NOTICE)).not.toBeInTheDocument();
      expect(screen.getByLabelText('제목', { exact: false })).toHaveValue('큰 순간');
      expect(operations).not.toContain('CompletePostUpload');

      await user.click(submit);
      await waitFor(() => expect(StorageRequest.sent).toHaveLength(2));
      expect(screen.getByRole('button', { name: '올리는 중 0%' })).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(STAY_NOTICE)).toBeVisible();
      act(() => sentRequest(1).respond(204));
      await waitFor(() => expect(operations).toContain('CompletePostUpload'));
      release(completeUpload, { completePostUpload: COMPLETED_UPLOAD });
      await waitFor(() => expect(operations).toContain('CreatePost'));
      release(createPost, { createPost: CREATED_POST });
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith('post-1'));
    },
  );
});
