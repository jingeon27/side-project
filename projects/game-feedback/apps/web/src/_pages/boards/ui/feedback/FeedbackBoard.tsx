'use client';

import { appRoutes } from '@game-feedback/bridge';

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
import { FeedbackFilters } from './FeedbackFilters';

export function FeedbackBoard({ locale, initialBoard }: IBoardPageProps) {
  const initialSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  return (
    <section className="board-page">
      <BoardComposeEntry locale={locale} board="FEEDBACK" />
      <FeedbackFilters locale={locale} initialSearch={initialSearch} />
      <BoardPostList locale={locale} initialBoard={initialBoard} board="FEEDBACK" slug="feedback">
        {(post, game) => (
          <PostCard key={post.id} post={post}>
            <PostCardHeader>
              <PostCardBoard showLabel={false} />
            </PostCardHeader>
            <PostCardContent href={appRoutes.post(locale, post.id, post.board, game.slug)} />
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
