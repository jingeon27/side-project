'use client';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { FilePenLine } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';
import { Button } from '@side/design-system';

import {
  PostCard,
  PostCardActivity,
  PostCardAuthor,
  PostCardAuthorName,
  PostCardBoard,
  PostCardContent,
  PostCardDetails,
  PostCardFooter,
  PostCardHeader,
  postListOptions,
  PostListSkeleton,
} from '@/features/post';
import { UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary } from '@/shared/ui';

interface IMyPostsProps {
  locale: string;
  userId: string;
}
export function MyPosts(props: IMyPostsProps) {
  const { t } = useI18n();
  return (
    <section className="settings-posts" aria-label={t('내가 작성한 글')}>
      <div className="section-title-row">
        <h2>{t('내가 작성한 글')}</h2>
      </div>
      <AsyncBoundary
        title={t('내가 작성한 글')}
        resetKey={props.userId}
        clientOnly
        pendingFallback={<PostListSkeleton />}
      >
        <MyPostList {...props} />
      </AsyncBoundary>
    </section>
  );
}
function MyPostList({ locale, userId }: IMyPostsProps) {
  const { t } = useI18n();
  const posts = useSuspenseInfiniteQuery(postListOptions({ authorId: userId, board: 'ALL', limit: 6 }));
  const items = posts.data.pages.flatMap((page) => page.items);
  if (!items.length)
    return (
      <div className="board-empty">
        <span
          aria-hidden
          className="relative mx-auto mb-3 inline-grid size-14 shrink-0 place-items-center text-accent"
        >
          <FilePenLine className="size-full" />
        </span>
        <p>{t('아직 작성한 글이 없어요.')}</p>
      </div>
    );
  return (
    <>
      <div className="post-list settings-post-list">
        {items.map((post) => (
          <PostCard key={post.id} post={post}>
            <PostCardHeader>
              <PostCardBoard />
            </PostCardHeader>
            <PostCardContent href={appRoutes.post(locale, post.id, post.board, post.category.slug)}>
              <PostCardDetails />
            </PostCardContent>
            <PostCardFooter>
              <PostCardAuthor>
                <PostCardAuthorName />
                <UserBadges author={post.author} compact />
              </PostCardAuthor>
              <PostCardActivity />
            </PostCardFooter>
          </PostCard>
        ))}
      </div>
      {posts.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          className="load-more"
          disabled={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
        >
          {t('더 보기')}
        </Button>
      )}
    </>
  );
}
