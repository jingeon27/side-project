'use client';

import { appRoutes } from '@game-feedback/bridge';

import { BattleSummary } from '@/features/battle';
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
import { BattleFilters } from './BattleFilters';

export function BattleBoard({ locale, initialBoard }: IBoardPageProps) {
  const initialSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  return (
    <section className="board-page">
      <BoardHeading locale={locale} board="FRIENDLY" title="전투 모집" />
      <BattleFilters locale={locale} slug="friendly" initialSearch={initialSearch} />
      <BoardPostList locale={locale} initialBoard={initialBoard} board="FRIENDLY" slug="friendly">
        {(post, game) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} />
            </PostCardHeader>
            <PostCardContent post={post} href={appRoutes.post(locale, post.id, post.board, game.slug)}>
              {post.battle && <BattleSummary details={post.battle} />}
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
