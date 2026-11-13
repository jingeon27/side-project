import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GalleryPostCardFragmentDoc,
  PostCategoryOptionsDocument,
  PostKind,
  type GalleryPostCardFragment,
} from '@/shared/api/generated';

import { EditPostBottomSheet } from './EditPostBottomSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const post: GalleryPostCardFragment = {
  __typename: 'GalleryPost',
  id: 'post-1',
  category: null,
  contestId: null,
  contest: null,
  groupId: 'group-1',
  groupName: '웃음 그룹',
  title: '점심의 순간',
  body: '밥 먹다 웃은 순간',
  kind: PostKind.Photo,
  mediaUrl: '/backend/media/upload-1',
  mediaWidth: null,
  mediaHeight: null,
  linkUrl: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  canDelete: true,
  canModerate: false,
  canInteract: true,
  author: { __typename: 'User', id: 'author', nickname: '작성자', avatar: null },
};

/** `delay`를 Infinity로 주면 응답이 오지 않아 불러오는 동안의 화면이 남는다. */
async function openSheet(delay?: number) {
  const user = userEvent.setup();
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: post });
  const client = new ApolloClient({
    cache,
    link: new MockLink([
      {
        request: { query: PostCategoryOptionsDocument, variables: { id: 'group-1' } },
        delay,
        result: {
          data: {
            group: {
              __typename: 'Group',
              id: 'group-1',
              categories: [{ __typename: 'GroupCategory', id: 'category-1', name: '일상' }],
            },
          },
        },
      },
    ]),
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <EditPostBottomSheet
                postId="post-1"
                groupId="group-1"
                isOpen={isOpen}
                onClose={onClose}
                unmount={unmount}
              />
            ))
          }
        >
          수정
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  await user.click(screen.getByRole('button', { name: '수정' }));
  return screen.findByRole('dialog', { name: '게시물 수정' });
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('EditPostBottomSheet', () => {
  it('하단 행에 취소 하나와 저장을 같은 너비의 이웃으로 두어야 한다', async () => {
    const sheet = await openSheet();
    const save = await within(sheet).findByRole('button', { name: '수정 저장하기' });
    const cancels = within(sheet).getAllByRole('button', { name: '취소' });
    expect(cancels).toHaveLength(1);
    // 시트 하단 행은 바로 아래 자식끼리만 너비를 똑같이 나눈다.
    expect(save.parentElement).toBe(cancels[0]?.parentElement);
    expect(save.parentElement).toHaveAttribute('data-slot', 'bottom-sheet-footer');
  });

  it('불러오는 동안 자리표시는 스크롤 본문 상자와 같이 제목에서 20px 떨어져야 한다', async () => {
    const sheet = await openSheet(Infinity);
    const header = sheet.querySelector('[data-slot="bottom-sheet-header"]');
    // 제목 영역 아래 여백 14px에 본문 위쪽 여백 6px을 더해 20px이 된다. 자리표시는 본문 밖에 놓여 6px을 직접 둔다.
    expect(header?.nextElementSibling).toHaveClass('animate-pulse', 'mt-1.5');
    expect(sheet.querySelector('[data-slot="bottom-sheet-body"]')).toBeNull();
  });

  // 제목 영역과 스크롤 본문은 좌우 24px 여백을 두는데, 자리표시는 mx-5(20px)라 불러온 뒤 4px씩 안으로 밀렸다.
  it('불러오는 동안 자리표시는 제목·본문과 같은 좌우 24px에 있어야 한다', async () => {
    const sheet = await openSheet(Infinity);
    const placeholder = sheet.querySelector('[data-slot="bottom-sheet-header"]')?.nextElementSibling;
    expect(placeholder).toHaveClass('animate-pulse', 'mx-6');
    expect(placeholder).not.toHaveClass('mx-5');
  });
});
