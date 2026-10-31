'use client';

import { appRoutes } from '@game-feedback/bridge';

import { CoachingSummary } from '@/features/coaching';
import {
  PostCard,
  PostCardActivity,
  PostCardBoard,
  PostCardContent,
  PostCardFooter,
  PostCardHeader,
} from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';

import { boardSnapshotSearch } from '../../model/board-filters';
import type { IBoardPageProps } from '../../model/board-page.type';
import { BoardHeading } from '../board/BoardHeading';
import { BoardPostList } from '../board/BoardPostList';
import { CoachingFilters } from './CoachingFilters';

export function CoachingBoard({ locale, initialBoard }: IBoardPageProps) {
  const initialSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  return (
    <section className="board-page">
      <BoardHeading locale={locale} board="COACHING" title="게임코치" action="코칭 등록" />
      <CoachingFilters locale={locale} slug="coaching" initialSearch={initialSearch} />
      <BoardPostList locale={locale} initialBoard={initialBoard} board="COACHING" slug="coaching">
        {(post, game) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} />
            </PostCardHeader>
            <PostCardContent post={post} href={appRoutes.post(locale, post.id, post.board, game.slug)}>
              {post.coaching && <CoachingSummary details={post.coaching} />}
            </PostCardContent>
            <PostCardFooter
              post={post}
              authorName={<AuthorLink author={post.author} locale={locale} />}
              authorContent={<UserBadges author={post.author} compact />}
            >
              <PostCardActivity post={post} />
            </PostCardFooter>
          </PostCard>
        )}
      </BoardPostList>
    </section>
  );
}
