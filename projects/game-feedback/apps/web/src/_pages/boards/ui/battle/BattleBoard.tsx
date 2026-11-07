'use client';

import { appRoutes } from '@game-feedback/bridge';

import { BattleSummary } from '@/features/battle';
import {
  PostCard,
  PostCardActivity,
  PostCardAuthor,
  PostCardAuthorName,
  PostCardBoard,
  PostCardContent,
  PostCardFooter,
  PostCardHeader,
} from '@/features/post';
import { AuthorLink, UserBadges } from '@/features/user';

import { boardSnapshotSearch } from '../../model/board-filters';
import type { IBoardPageProps } from '../../model/board-page.type';
import { BoardComposeEntry } from '../board/BoardComposeEntry';
import { BoardPostList } from '../board/BoardPostList';
import { BattleFilters } from './BattleFilters';

export function BattleBoard({ locale, initialBoard }: IBoardPageProps) {
  const initialSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  return (
    <section className="board-page">
      <BoardComposeEntry locale={locale} board="FRIENDLY" />
      <BattleFilters locale={locale} slug="friendly" initialSearch={initialSearch} />
      <BoardPostList locale={locale} initialBoard={initialBoard} board="FRIENDLY" slug="friendly">
        {(post, game) => (
          <PostCard key={post.id} post={post}>
            <PostCardHeader>
              <PostCardBoard />
            </PostCardHeader>
            <PostCardContent href={appRoutes.post(locale, post.id, post.board, game.slug)}>
              {post.battle && <BattleSummary details={post.battle} />}
            </PostCardContent>
            <PostCardFooter>
              <PostCardAuthor>
                <PostCardAuthorName>
                  <AuthorLink author={post.author} locale={locale} />
                </PostCardAuthorName>
                <UserBadges author={post.author} compact />
              </PostCardAuthor>
              <PostCardActivity />
            </PostCardFooter>
          </PostCard>
        )}
      </BoardPostList>
    </section>
  );
}
