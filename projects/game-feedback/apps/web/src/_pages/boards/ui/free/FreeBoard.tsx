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

import type { IBoardPageProps } from '../../model/board-page.type';
import { BoardHeading } from '../board/BoardHeading';
import { BoardPostList } from '../board/BoardPostList';

export function FreeBoard({ locale, initialBoard }: IBoardPageProps) {
  return (
    <section className="board-page">
      <BoardHeading locale={locale} board="FREE" title="자유게시판" />

      <BoardPostList locale={locale} initialBoard={initialBoard} board="FREE" slug="free">
        {(post, game) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} />
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
