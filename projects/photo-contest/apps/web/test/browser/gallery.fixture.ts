import type { Page } from '@playwright/test';

import type { GalleryPostCardFragment, GalleryPostsQuery } from '../../src/shared/api/generated';

const pageSize = 24;
const posts: GalleryPostCardFragment[] = Array.from({ length: pageSize * 2 }, (_, index) => ({
  __typename: 'GalleryPost',
  id: String(index + 1),
  groupId: 'test-group',
  groupName: '테스트 그룹',
  title: '테스트 사진 ' + (index + 1),
  body: '스크롤과 메뉴를 확인하는 사진이에요.',
  category: null,
  contestId: null,
  contest: null,
  kind: 'PHOTO',
  mediaUrl: '/brand/afternoon-cat.svg',
  linkUrl: null,
  createdAt: '2026-11-10T03:00:00.000Z',
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  canDelete: true,
  canModerate: false,
  canInteract: true,
  author: { __typename: 'User', id: 'test-user', nickname: '테스트 회원', avatar: null },
}));

type TResponse = 'success' | 'error';

export async function openGallery(
  page: Page,
  {
    responses = {},
    lastPageSize = 2,
  }: { responses?: Partial<Record<number, Promise<TResponse>>>; lastPageSize?: number } = {},
) {
  const offsets: Array<number | undefined> = [];
  await page.route('**/__test__/gallery', async (route) => {
    const { operationName, variables } = route.request().postDataJSON() as {
      operationName: string;
      variables: { offset?: number; limit?: number };
    };
    const { offset, limit } = variables;
    const firstRequest = !offsets.includes(offset);
    offsets.push(offset);
    if (operationName !== 'GalleryPosts' || (offset !== 0 && offset !== pageSize) || limit !== pageSize) {
      await route.fulfill({ status: 400, json: { errors: [{ message: '예상하지 않은 요청이에요.' }] } });
      return;
    }
    if (firstRequest && (await responses[offset]) === 'error') {
      await route.fulfill({ json: { errors: [{ message: '목록 요청에 실패했어요.' }] } });
      return;
    }
    const data: GalleryPostsQuery = {
      galleryPostsPage: {
        __typename: 'GalleryPostPage',
        nextOffset: offset === 0 ? pageSize : null,
        items: posts.slice(offset, offset + (offset === 0 ? pageSize : lastPageSize)),
      },
    };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/?example=gallery');
  const feed = page.getByRole('region', { name: '최신 게시물', exact: true });
  return { feed, cards: feed.getByRole('article'), offsets };
}
