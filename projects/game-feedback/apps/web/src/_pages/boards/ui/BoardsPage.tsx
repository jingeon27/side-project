'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Button, Input } from '@side/design-system';
import type { Category } from '@/shared/api';
import { appRoutes } from '@game-feedback/bridge';
import { boardBySlug } from '@/features/board';
import { postListOptions, PostCard } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useSession } from '@/features/auth';
import { PostComposer } from '@/widgets/post-composer';
import { useI18n } from '@/shared/i18n';
import { AsyncBoundary, LoadingState, openOverlay } from '@/shared/ui';

interface IBoardsPageProps {
  locale: string;
  slug: string;
  game: Category;
}
export function BoardsPage({ locale, slug, game }: IBoardsPageProps) {
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
        categoryId={game.id}
      />
    ));
  }
  return (
    <section className="board-page">
      <div className="page-heading board-heading">
        <h1>{t(board.name)}</h1>
        <Button variant="primary" size="md" type="button" onClick={handleCompose}>
          <Plus size={16} />
          {t(board.kind === 'COACHING' ? '코칭 등록' : '글쓰기')}
        </Button>
      </div>
      <form
        className="board-search"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          router.replace(
            appRoutes.boards(locale, slug, String(form.get('q') ?? '').slice(0, 100), game.slug),
          );
        }}
      >
        <Input
          key={q}
          name="q"
          defaultValue={q}
          maxLength={100}
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
        <BoardPosts locale={locale} slug={slug} q={q} game={game} />
      </AsyncBoundary>
    </section>
  );
}
function BoardPosts({ locale, slug, q, game }: IBoardsPageProps & { q: string }) {
  const { t } = useI18n();
  const board = boardBySlug(slug);
  const posts = useSuspenseInfiniteQuery(
    postListOptions({ category: game.slug, board: board?.kind, q, limit: 12 }),
  );
  const items = posts.data.pages.flatMap((page) => page.items);
  return (
    <>
      {!items.length && <p className="board-empty">{t('아직 게시글이 없어요. 첫 글을 남겨보세요.')}</p>}
      <div className="post-list board-post-list">
        {items.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            href={appRoutes.post(locale, post.id, post.board, game.slug)}
            authorName={<AuthorLink author={post.author} locale={locale} />}
            authorContent={<UserBadges author={post.author} compact />}
          />
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
