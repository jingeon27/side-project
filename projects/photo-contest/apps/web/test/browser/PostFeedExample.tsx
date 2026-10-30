import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';

import { PopularPostCard } from '../../src/features/post/ui/card/PopularPostCard';
import { PostCard } from '../../src/features/post/ui/card/PostCard';
import { GalleryFeed } from '../../src/features/post/ui/feed/GalleryFeed';
import {
  GalleryPostCardFragmentDoc,
  LikePostDocument,
  PostKind,
  UnlikePostDocument,
  type GalleryPostCardFragment,
} from '../../src/shared/api/generated';

const POST = {
  __typename: 'GalleryPost',
  id: 'preview-post',
  groupId: 'preview-group',
  groupName: '우리끼리 모은 순간',
  title: '잠깐 자리 비운 사이 소파 주인이 바뀌었다',
  body: '노트북은 켜뒀는데 일은 고양이가 쉬는 동안 하기로 했습니다.\n오늘도 집에서 가장 바쁜 건 고양이.',
  category: null,
  contestId: null,
  contest: null,
  kind: PostKind.Photo,
  mediaUrl: '/brand/afternoon-cat.svg',
  linkUrl: null,
  createdAt: '2026-10-30T03:00:00.000Z',
  likeCount: 2,
  commentCount: 0,
  likedByMe: false,
  canDelete: false,
  canModerate: false,
  canInteract: true,
  author: { __typename: 'User', id: 'preview-author', nickname: '화면 예시', avatar: null },
} satisfies GalleryPostCardFragment;

function createPreviewClient() {
  const cache = new InMemoryCache();
  cache.writeFragment({ fragment: GalleryPostCardFragmentDoc, data: POST });
  return new ApolloClient({
    cache,
    link: new MockLink([
      {
        request: { query: LikePostDocument, variables: { postId: POST.id } },
        result: {
          data: { likePost: { __typename: 'GalleryPost', id: POST.id, likeCount: 3, likedByMe: true } },
        },
      },
      {
        request: { query: UnlikePostDocument, variables: { postId: POST.id } },
        result: {
          data: { unlikePost: { __typename: 'GalleryPost', id: POST.id, likeCount: 2, likedByMe: false } },
        },
      },
    ]),
  });
}

const client = createPreviewClient();

export function PostFeedExample() {
  return (
    <ApolloProvider client={client}>
      <main id="pc-main" className="min-h-dvh bg-sunken px-4 py-8 tablet:px-8">
        <div className="mx-auto mb-8 max-w-6xl">
          <p className="text-micro text-accent-ink">컴포넌트 검증용 예시 데이터</p>
          <h1 className="mt-2 text-display text-ink">피드 디자인 미리보기</h1>
        </div>
        <div id="feed-preview">
          <GalleryFeed
            latest={
              <section aria-label="최신 게시물">
                <h2 className="mb-4 text-title-lg text-ink">최신 게시물</h2>
                <PostCard id={POST.id} />
              </section>
            }
            popular={
              <section aria-label="이달의 인기">
                <h2 className="mb-5 text-subtitle text-ink">이달의 인기</h2>
                <PopularPostCard id={POST.id} rank={1} />
              </section>
            }
          />
        </div>
      </main>
    </ApolloProvider>
  );
}
