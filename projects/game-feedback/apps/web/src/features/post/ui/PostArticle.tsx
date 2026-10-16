import type { ReactNode } from 'react';
import { MessageSquare } from 'lucide-react';
import type { Post } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
import { PostStatus } from './PostStatus';
interface IPostArticleProps {
  post: Post;
  authorContent?: ReactNode;
  actions?: ReactNode;
  profile?: ReactNode;
}
export function PostArticle({ post, authorContent, actions, profile }: IPostArticleProps) {
  return (
    <article className="detail-card">
      <div className="post-topline">
        <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
        <span className="post-time">클래시 로얄</span>
      </div>
      <h1>{post.title}</h1>
      <div className="detail-author">
        <Avatar name={post.author.nickname} />
        <div>
          <strong>{post.author.nickname}</strong>
          {authorContent}
          <span>
            {timeAgo(post.createdAt)}
            {post.updatedAt !== post.createdAt && ' · 수정됨'}
          </span>
        </div>
        {actions}
      </div>
      <div className="prose-body">{post.body}</div>
      {profile}
      <div className="detail-footnote">
        <MessageSquare size={15} />
        새로운 시선과 구체적인 제안을 기다리고 있어요.
      </div>
    </article>
  );
}
