'use client';

import { use } from 'react';
import { Button, Input } from '@side/design-system';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import { useSession } from '@/features/auth';
import { postListOptions, PostCard, PostListSkeleton } from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';
import { useI18n } from '@/shared/i18n';
import { BackLink, useBrowserSearch } from '@/shared/navigation';
import { AsyncBoundary } from '@/shared/ui';
import { searchQuery, type ISearchSnapshot } from '../model/search-query';
import { usePostSearch } from '../model/use-post-search';

interface ISearchPageProps {
  locale: string;
  initialPath: string;
  initialSearch: ISearchSnapshot | Promise<ISearchSnapshot>;
}

export function SearchPage({ locale, initialPath, initialSearch }: ISearchPageProps) {
  const { t } = useI18n();
  const search = useBrowserSearch(
    initialPath.includes('?') ? `?${initialPath.split('?')[1]}` : '',
    `/${locale}/search`,
  );
  const route = resolveAppRoute(`/${locale}/search${search}`);
  const path = route?.path ?? initialPath;
  const { board, request } = searchQuery(path);
  const { form, search: draft, handleClear, handleSubmit } = usePostSearch(request.q);
  return (
    <section className="search-page">
      <div className="search-heading">
        <BackLink
          href={route?.parent ?? appRoutes.feed(locale)}
          aria-label={t('돌아가기')}
          className="icon-button"
        >
          <ArrowLeft size={20} />
        </BackLink>
        <h1 className="max-[760px]:sr-only">{t('검색')}</h1>
      </div>
      <form className="post-search-form" role="search" aria-label={t('게시글 검색')} onSubmit={handleSubmit}>
        <Input
          {...form.register('q')}
          maxLength={100}
          autoComplete="off"
          autoFocus
          aria-label={t(board ? '게시판 검색' : '게시글 검색')}
          placeholder={t('제목이나 내용으로 검색')}
        />
        {draft && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={t('검색어 지우기')}
            onClick={handleClear}
          >
            <X size={18} />
          </Button>
        )}
        <Button variant="accent" size="icon" type="submit" aria-label={t('검색')}>
          <Search size={20} />
        </Button>
      </form>
      <p className="search-scope">
        {t('검색 범위')}: {t(board?.name ?? '전체')}
      </p>
      {!request.q ? (
        <p className="search-empty">{t('검색어를 입력해주세요.')}</p>
      ) : (
        <AsyncBoundary
          title={t('검색 결과')}
          resetKey={path}
          refreshOnRetry
          suspense={'then' in initialSearch}
          pendingFallback={<PostListSkeleton />}
        >
          <SearchResults locale={locale} path={path} initialSearch={initialSearch} />
        </AsyncBoundary>
      )}
    </section>
  );
}

function SearchResults({
  locale,
  path,
  initialSearch,
}: {
  locale: string;
  path: string;
  initialSearch: ISearchPageProps['initialSearch'];
}) {
  const { t } = useI18n();
  const initial = 'then' in initialSearch ? use(initialSearch) : initialSearch;
  const { session } = useSession();
  const { board, request } = searchQuery(path);
  const same = initial.path === path && initial.viewerId === session.user?.id && initial.posts;
  const results = useInfiniteQuery({
    ...postListOptions(request),
    throwOnError: true,
    ...(same ? { initialData: { pages: [same], pageParams: [''] }, initialDataUpdatedAt: 0 } : {}),
  });
  if (!results.data) return <PostListSkeleton />;
  const posts = results.data.pages.flatMap((page) => page.items);
  return (
    <>
      {!posts.length && <p className="search-empty">{t('일치하는 게시글이 없어요')}</p>}
      <div className="post-list">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            showBoardLabel={board?.kind !== 'FEEDBACK'}
            href={appRoutes.post(locale, post.id, board?.kind, request.category)}
            authorName={<AuthorLink author={post.author} locale={locale} />}
            authorContent={<UserBadges author={post.author} compact />}
          />
        ))}
      </div>
      {results.hasNextPage && (
        <Button
          variant="secondary"
          type="button"
          fullWidth
          disabled={results.isFetchingNextPage}
          onClick={() => results.fetchNextPage()}
        >
          {t('더 보기')}
        </Button>
      )}
    </>
  );
}
