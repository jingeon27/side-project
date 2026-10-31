'use client';

import { appRoutes } from '@game-feedback/bridge';

import { FriendSaleSummary } from '@/features/friend-sale';
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

export function FriendSaleBoard({ locale, initialBoard }: IBoardPageProps) {
  return (
    <section className="board-page">
      <BoardHeading locale={locale} board="FRIEND_SALE" title="친추판매" />

      <BoardPostList locale={locale} initialBoard={initialBoard} board="FRIEND_SALE" slug="friend-sale">
        {(post, game) => (
          <PostCard key={post.id} board={post.board}>
            <PostCardHeader post={post}>
              <PostCardBoard post={post} />
            </PostCardHeader>
            <PostCardContent post={post} href={appRoutes.post(locale, post.id, post.board, game.slug)}>
              <FriendSaleSummary details={post.friendSale} />
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
