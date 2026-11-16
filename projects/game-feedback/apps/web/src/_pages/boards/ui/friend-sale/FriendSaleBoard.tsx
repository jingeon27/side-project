'use client';

import { appRoutes } from '@game-feedback/bridge';

import { FriendSaleSummary } from '@/features/friend-sale';
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

import type { IBoardPageProps } from '../../model/board-page.type';
import { BoardComposeEntry } from '../board/BoardComposeEntry';
import { BoardPostList } from '../board/BoardPostList';

export function FriendSaleBoard({ locale, initialBoard }: IBoardPageProps) {
  return (
    <section className="board-page">
      <BoardComposeEntry locale={locale} board="FRIEND_SALE" />

      <BoardPostList locale={locale} initialBoard={initialBoard} board="FRIEND_SALE" slug="friend-sale">
        {(post, game) => (
          <PostCard key={post.id} post={post}>
            <PostCardHeader>
              <PostCardBoard />
            </PostCardHeader>
            <PostCardContent href={appRoutes.post(locale, post.id, post.board, game.slug)}>
              <FriendSaleSummary details={post.friendSale} />
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
