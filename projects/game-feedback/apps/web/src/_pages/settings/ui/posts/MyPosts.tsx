'use client';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';

import { appRoutes } from '@game-feedback/bridge';
import { Button, StatusAnimation } from '@side/design-system';
import { ButtonLink } from '@side/design-system/next';

import {
  PostCard,
  PostCardActivity,
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
        <StatusAnimation variant="empty" className="mx-auto mb-3 size-14" />
        <p>{t('아직 작성한 글이 없어요.')}</p>
        <ButtonLink href={appRoutes.compose(locale)} variant="secondary" size="sm">
          {t('글쓰기')}
        </ButtonLink>
      </div>
    );
  return (
    <>
      <div className="post-list settings-post-list">
        {items.map((post) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} />
            </PostCardHeader>
            <PostCardContent
              post={post}
              href={appRoutes.post(locale, post.id, post.board, post.category.slug)}
            >
              <PostCardDetails post={post} />
            </PostCardContent>
            <PostCardFooter post={post} authorContent={<UserBadges author={post.author} compact />}>
              <PostCardActivity post={post} />
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
