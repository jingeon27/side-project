'use client';
import { useI18n } from '@/shared/i18n';
import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Post } from '@/shared/api';
import { Avatar, RichTextBody } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
import { PostStatus } from './PostStatus';
import { boardByKind } from '@/features/board';
interface IPostArticleProps {
  post: Post;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  actions?: ReactNode;
  profile?: ReactNode;
}
export function PostArticle({ post, authorContent, authorName, actions, profile }: IPostArticleProps) {
  const { t, locale: textLocale } = useI18n();
  const board = boardByKind(post.board);
  return (
    <article className="detail-card">
      <div className="post-topline">
        {board ? (
          <span className="status-pill">{t(board.name)}</span>
        ) : (
          <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
        )}
        <span className="post-time">{t('클래시 로얄')}</span>
      </div>
      <h1>{post.title}</h1>
      <div className="detail-author">
        <Avatar name={post.author.nickname} />
        <div>
          <strong>{authorName ?? post.author.nickname}</strong>
          {authorContent}
          <span>
            {timeAgo(post.createdAt, textLocale)}
            {post.updatedAt !== post.createdAt && t(' (수정됨)')}
          </span>
        </div>
        {actions}
      </div>
      <RichTextBody body={post.body} document={post.document} />
      {profile}
      <div className="detail-footnote">
        <MessageSquare size={15} />
        {t(
          board
            ? '궁금한 내용은 댓글이나 채팅으로 이야기해보세요.'
            : '새로운 시선과 구체적인 제안을 기다리고 있어요.',
        )}
      </div>
    </article>
  );
}
