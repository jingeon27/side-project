import type { ReactNode } from 'react';
import Link from 'next/link';
import { Trophy, ArrowUpRight, MessageSquare } from 'lucide-react';
import type { Post } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
import { PostStatus } from './PostStatus';
interface IPostCardProps {
  post: Post;
  href: string;
  authorContent?: ReactNode;
  authorName?: ReactNode;
  deck?: ReactNode;
}
export function PostCard({ post, href, authorContent, authorName, deck }: IPostCardProps) {
  return (
    <article className="post-card">
      <div className="post-topline">
        <PostStatus answerCount={post.answerCount} helpfulCount={post.helpfulCount} />
        <span className="post-time">{timeAgo(post.createdAt)}</span>
      </div>
      <Link href={href} className="post-title-link">
        <h3>{post.title}</h3>
      </Link>
      <p className="post-excerpt">{post.body}</p>
      {post.gameProfile && (
        <div className="post-game-info">
          <div className="post-game-stat">
            <Trophy size={14} />
            <span>{post.gameProfile.trophies.toLocaleString()}</span>
            <span className="info-divider" />
            <span>{post.gameProfile.arena}</span>
          </div>
          {deck}
        </div>
      )}
      <div className="post-bottom">
        <span className="post-author">
          <Avatar name={post.author.nickname} size="small" />
          <strong>{authorName ?? post.author.nickname}</strong>
          {authorContent}
          <span className="post-author-game">클래시 로얄</span>
        </span>
        <span className={`answer-count ${post.answerCount > 0 ? 'has-answers' : ''}`}>
          <MessageSquare size={15} />
          피드백<strong>{post.answerCount}</strong>
          <ArrowUpRight size={15} />
        </span>
      </div>
    </article>
  );
}
