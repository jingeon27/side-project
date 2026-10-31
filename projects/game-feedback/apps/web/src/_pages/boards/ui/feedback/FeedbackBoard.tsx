'use client';

import { appRoutes } from '@game-feedback/bridge';

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
import { FeedbackFilters } from './FeedbackFilters';

export function FeedbackBoard({ locale, initialBoard }: IBoardPageProps) {
  const initialSearch = 'then' in initialBoard ? '' : boardSnapshotSearch(initialBoard);
  return (
    <section className="board-page">
      <BoardHeading locale={locale} board="FEEDBACK" title="피드백" />
      <FeedbackFilters locale={locale} initialSearch={initialSearch} />
      <BoardPostList locale={locale} initialBoard={initialBoard} board="FEEDBACK" slug="feedback">
        {(post, game) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} showLabel={false} />
            </PostCardHeader>
            <PostCardContent post={post} href={appRoutes.post(locale, post.id, post.board, game.slug)} />
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
