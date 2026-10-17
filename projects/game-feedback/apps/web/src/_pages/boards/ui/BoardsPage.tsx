'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { Button } from '@side/design-system';
import { appRoutes } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { postListOptions } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useSession } from '@/features/auth';
import { PostComposer } from '@/widgets/post-composer';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, Avatar, LoadingState, openOverlay } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';

interface IBoardsPageProps {
  locale: string;
  slug: string;
}
export function BoardsPage({ locale, slug }: IBoardsPageProps) {
  const { t } = useI18n();
  const board = boardBySlug(slug);
  const { session, login } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get('q') ?? '').trim().slice(0, 100);
  if (!board) return null;
  function handleCompose() {
    if (!session.user) {
      login();
      return;
    }
    openOverlay(({ isOpen, close, unmount }) => (
      <PostComposer
        open={isOpen}
        onOpenChange={(open) => {
          if (open) return;
          close();
          unmount();
        }}
        locale={locale}
        board={board?.kind}
      />
    ));
  }
  return (
    <section className="board-page">
      <div className="page-heading board-heading">
        <div>
          <h1>{t(board.name)}</h1>
          <p>{t(board.description)}</p>
        </div>
        <Button variant="primary" size="md" type="button" onClick={handleCompose}>
          <Plus size={16} />
          {t('글쓰기')}
        </Button>
      </div>
      <form
        className="board-search"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          router.replace(appRoutes.boards(locale, slug, String(form.get('q') ?? '').slice(0, 100)));
        }}
      >
        <input
          key={q}
          name="q"
          defaultValue={q}
          maxLength={100}
          className="ds-input"
          aria-label={t('게시판 검색')}
          placeholder={t('게시판 검색')}
        />
        <Button variant="secondary" size="md" type="submit" aria-label={t('검색')}>
          <Search size={18} />
        </Button>
      </form>
      <AsyncBoundary
        clientOnly
        title={t('게시판')}
        resetKey={`${session.user?.id}:${slug}:${q}`}
        pendingFallback={<LoadingState />}
      >
        <BoardPosts locale={locale} slug={slug} q={q} />
      </AsyncBoundary>
    </section>
  );
}
function BoardPosts({ locale, slug, q }: IBoardsPageProps & { q: string }) {
  const { t, locale: textLocale } = useI18n();
  const board = boardBySlug(slug);
  const posts = useSuspenseInfiniteQuery(
    postListOptions({ category: 'clash-royale', board: board?.kind, q, limit: 12 }),
  );
  const items = posts.data.pages.flatMap((page) => page.items);
  return (
    <>
      {!items.length && <p className="board-empty">{t('아직 게시글이 없어요. 첫 글을 남겨보세요.')}</p>}
      <div className="board-post-list">
        {items.map((post) => (
          <article className="board-post-row" key={post.id}>
            <Link className="board-post-title" href={appRoutes.post(locale, post.id, post.board)}>
              <h2>{post.title}</h2>
              <ArrowUpRight size={17} />
            </Link>
            <p>{post.body}</p>
            <div className="board-post-author">
              <Avatar name={post.author.nickname} size="small" />
              <AuthorLink author={post.author} locale={locale} />
              <UserBadges author={post.author} compact />
              <time dateTime={post.createdAt}>{timeAgo(post.createdAt, textLocale)}</time>
            </div>
          </article>
        ))}
      </div>
      {posts.hasNextPage && (
        <Button
          variant="secondary"
          size="md"
          type="button"
          disabled={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
        >
          {t('더 보기')}
        </Button>
      )}
    </>
  );
}
