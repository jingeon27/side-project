import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import {
  ContestDocument,
  CreateSubmissionDocument,
  Phase,
  RequestUploadDocument,
  SubmissionsDocument,
  SubmissionSort,
  CompleteSubmissionUploadDocument,
  type ContestQuery,
  type SubmissionCardFragment,
} from '@/shared/api/generated';
import { trackEvent } from '@/shared/model/analytics';
import { toast } from '@/shared/model/toast';

import { UploadPhotoBottomSheet } from './UploadPhotoBottomSheet';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

const CONTEST: ContestQuery['contest'] = {
  __typename: 'Contest',
  id: 'contest-1',
  groupId: 'group-1',
  title: '가을 사진전',
  phase: Phase.Submission,
  startsAt: '2026-10-14T03:00:00.000Z',
  submissionEndsAt: '2026-10-17T03:00:00.000Z',
  endsAt: '2026-10-21T03:00:00.000Z',
  isAdmin: false,
  mySubmissionId: null,
  votedSubmissionId: null,
  submissionCount: 0,
  hiddenSubmissions: [],
};

const SUBMISSION: SubmissionCardFragment = {
  __typename: 'Submission',
  id: 'photo-1',
  contestId: 'contest-1',
  caption: '고양이 기지개',
  imageUrl: '/backend/photos/photo-1',
  hidden: false,
  createdAt: '2026-10-14T04:00:00.000Z',
  voteCount: null,
  likeCount: 0,
  likedByMe: false,
  reportCount: null,
  author: { __typename: 'User', id: 'user-1', nickname: '진건', avatar: null },
  reports: null,
};

const png = (name = 'moment.png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

const successMocks = (): MockLink.MockedResponse[] => [
  {
    request: { query: CompleteSubmissionUploadDocument, variables: { uploadId: 'upload-1' } },
    result: { data: { completeSubmissionUpload: true } },
  },

  {
    request: {
      query: RequestUploadDocument,
      variables: (variables) =>
        variables.contestId === 'contest-1' &&
        variables.contentType === 'image/png' &&
        variables.byteSize > 0,
    },
    result: {
      data: {
        requestUploadUrl: {
          __typename: 'UploadTicket',
          id: 'upload-1',
          url: 'https://storage.test/upload',
          fields: [{ __typename: 'UploadFormField', name: 'key', value: 'staging/photo' }],
          expiresAt: '2026-10-14T04:05:00.000Z',
        },
      },
    },
  },
  {
    request: {
      query: CreateSubmissionDocument,
      variables: {
        contestId: 'contest-1',
        uploadId: 'upload-1',
        caption: '고양이 기지개',
        rightsConfirmed: true,
      },
    },
    result: { data: { createSubmission: SUBMISSION } },
  },
];

const FEED = { contestId: 'contest-1', sort: SubmissionSort.Newest, offset: 0, limit: 24 };

const feedPage = (submissions: SubmissionCardFragment[]) => ({ submissions });

/** 대회 화면에 열려 있는 피드. 처음에는 비어 있고, 제출한 뒤 다시 받으면 내 사진이 보인다. */
const feedMocks = (): MockLink.MockedResponse[] => [
  { request: { query: SubmissionsDocument, variables: FEED }, result: { data: feedPage([]) } },
  { request: { query: SubmissionsDocument, variables: FEED }, result: { data: feedPage([SUBMISSION]) } },
];

function FeedProbe() {
  const { data } = useQuery(SubmissionsDocument, { variables: FEED });
  return (
    <ul aria-label="피드">
      {data?.submissions.map((submission) => (
        <li key={submission.id}>{submission.caption}</li>
      ))}
    </ul>
  );
}

let uploads: Array<{ uploadId: string; contentType: string }>;
let uploadStatus: number;

function renderSheet(mocks: MockLink.MockedResponse[] = [], { withFeed = false } = {}) {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), new MockLink(mocks)]),
  });
  client.writeQuery({ query: ContestDocument, variables: { id: 'contest-1' }, data: { contest: CONTEST } });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        {withFeed ? <FeedProbe /> : null}
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close, unmount }) => (
              <UploadPhotoBottomSheet
                contestId="contest-1"
                isOpen={isOpen}
                onClose={close}
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
  return { user, client, opener: screen.getByRole('button', { name: '사진 제출하기' }) };
}

async function openSheet(mocks?: MockLink.MockedResponse[], options?: { withFeed?: boolean }) {
  const view = renderSheet(mocks, options);
  await view.user.click(view.opener);
  await screen.findByRole('dialog', { name: '내 웃긴 순간 제출하기' });
  return view;
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getAllByRole('button', { name: '사진 제출하기' }).at(-1) ?? document.body);

beforeEach(() => {
  vi.clearAllMocks();
  uploads = [];
  uploadStatus = 201;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      const form = options.body as FormData;
      const file = form.get('file') as Blob;
      uploads.push({ uploadId: 'upload-1', contentType: file.type });
      return new Response(null, { status: uploadStatus });
    }),
  );
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
  let sequence = 0;
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:preview-${++sequence}`),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => overlay.unmountAll());
});

describe('UploadPhotoBottomSheet', () => {
  it('아무것도 고르지 않고 제출하면 칸마다 안내하고 요청하지 않아야 한다', async () => {
    const { user } = await openSheet();

    await submit(user);

    expect(await screen.findByText('사진 한 장을 선택해 주세요.')).toBeVisible();
    expect(screen.getByText('사진 설명을 입력해 주세요.')).toBeVisible();
    expect(screen.getByText('사진을 공유할 권리와 촬영된 사람의 동의를 확인해 주세요.')).toBeVisible();
    expect(screen.getByLabelText('사진 선택')).toHaveAttribute('aria-invalid', 'true');
    expect(uploads).toEqual([]);
  });

  it('사진을 고르면 미리 보여 주고 다시 고르면 이전 미리보기를 풀어야 한다', async () => {
    const { user } = await openSheet();
    const input = screen.getByLabelText('사진 선택');

    await user.upload(input, png('first.png'));
    expect(await screen.findByRole('img', { name: '고른 사진 미리보기' })).toHaveAttribute(
      'src',
      'blob:preview-1',
    );
    await user.upload(input, png('second.png'));

    expect(screen.getByRole('img', { name: '고른 사진 미리보기' })).toHaveAttribute('src', 'blob:preview-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    // 같은 사진을 다시 고를 수 있게 입력을 비워 둔다.
    expect(input).toHaveValue('');
  });

  it('브라우저가 읽지 못하는 HEIC는 바꿔서 올리라고 사진 칸에 알려야 한다', async () => {
    const { user } = await openSheet(successMocks());

    await user.upload(
      screen.getByLabelText('사진 선택'),
      new File(['heic'], 'IMG_0001.HEIC', { type: 'image/heic' }),
    );
    await user.type(screen.getByLabelText('사진 설명'), '고양이 기지개');
    await user.click(screen.getByRole('checkbox'));
    await submit(user);

    expect(await screen.findByText(/JPEG\/PNG\/WebP로 바꿔 주세요/)).toBeVisible();
    expect(uploads).toEqual([]);
  });

  it('제출하면 사진을 올리고 시트를 닫은 뒤 제출 완료를 대회에 적고 피드를 다시 받아야 한다', async () => {
    const { user, client } = await openSheet([...successMocks(), ...feedMocks()], { withFeed: true });

    await user.upload(screen.getByLabelText('사진 선택'), png());
    await user.type(screen.getByLabelText('사진 설명'), '  고양이 기지개 ');
    await user.click(screen.getByRole('checkbox'));
    await submit(user);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(uploads).toEqual([{ uploadId: 'upload-1', contentType: 'image/png' }]);
    expect(toast.success).toHaveBeenCalledWith('사진을 제출했어요', expect.anything());
    expect(trackEvent).toHaveBeenCalledWith('photo_submitted', { contest_id: 'contest-1' });
    expect(
      client.readQuery({ query: ContestDocument, variables: { id: 'contest-1' } })?.contest,
    ).toMatchObject({
      mySubmissionId: 'photo-1',
      submissionCount: 1,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(within(screen.getByRole('list', { name: '피드' })).getByText('고양이 기지개')).toBeVisible();
  });

  it('저장소 전송이 실패하면 초안을 유지하고 파일 칸에 재시도 안내를 보여 줘야 한다', async () => {
    uploadStatus = 400;
    const { user } = await openSheet(successMocks());

    await user.upload(screen.getByLabelText('사진 선택'), png());
    await user.type(screen.getByLabelText('사진 설명'), '고양이 기지개');
    await user.click(screen.getByRole('checkbox'));
    await submit(user);

    await waitFor(() =>
      expect(screen.getByText('파일을 올리지 못했어요. 연결을 확인하고 다시 시도해 주세요.')).toBeVisible(),
    );
    expect(screen.getByRole('dialog', { name: '내 웃긴 순간 제출하기' })).toBeVisible();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('Escape로 닫으면 시트를 연 버튼으로 포커스가 돌아가야 한다', async () => {
    const { user, opener } = await openSheet();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
