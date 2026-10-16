'use client';
import { ButtonLink } from '@side/design-system/next';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { postDetailOptions, PostArticle } from '@/features/post';
import type { PostDetail } from '@/shared/api';
import { useSession } from '@/features/auth';
import { AuthorLink, UserBadges } from '@/features/user';
import { ProfileSnapshot } from '@/features/game-profile';
import { ErrorNotice, LoadingState, ServiceErrorBoundary } from '@/shared/ui';
import { usePostRead } from '../model/use-post-read.hook';
import { ContentActions } from './ContentActions';
import { PostAnswersSection } from './PostAnswersSection';
import { PostCommentsSection } from './PostCommentsSection';
interface IPostPageProps {
  id: string;
  locale: string;
  initialDetail?: PostDetail;
  initialViewerId?: string;
}
export function PostPage({ id, locale, initialDetail, initialViewerId }: IPostPageProps) {
  const { session } = useSession(),
    detail = useQuery({
      ...postDetailOptions(id),
      refetchOnMount: 'always',
      initialData: session?.user?.id === initialViewerId ? initialDetail : undefined,
    });
  usePostRead(detail.data, session?.user?.id);
  if (detail.isPending) return <LoadingState text="플레이 이야기를 불러오고 있어요" />;
  if (detail.isError || !detail.data)
    return (
      <div className="state-box">
        <ErrorNotice message={detail.error?.message || '피드백 요청을 찾을 수 없어요.'} />
        <ButtonLink variant="primary" size="md" className="button dark" href={`/${locale}`}>
          라운지로 돌아가기
        </ButtonLink>
      </div>
    );
  const { post, answers, comments } = detail.data;
  return (
    <>
      <Link className="back-link" href={`/${locale}`}>
        <ArrowLeft size={16} />
        피드백 라운지
      </Link>
      <ServiceErrorBoundary title="게시글" resetKey={id}>
        <PostArticle
          post={post}
          authorName={<AuthorLink author={post.author} locale={locale} />}
          authorContent={<UserBadges author={post.author} />}
          actions={
            <ContentActions type="POST" id={post.id} author={post.author} post={post} locale={locale} />
          }
          profile={post.gameProfile && <ProfileSnapshot profile={post.gameProfile} />}
        />
      </ServiceErrorBoundary>
      <ServiceErrorBoundary title="답변" resetKey={id}>
        <PostAnswersSection post={post} answers={answers} userId={session?.user?.id} locale={locale} />
      </ServiceErrorBoundary>
      <ServiceErrorBoundary title="댓글" resetKey={id}>
        <PostCommentsSection post={post} comments={comments} locale={locale} />
      </ServiceErrorBoundary>
    </>
  );
}
