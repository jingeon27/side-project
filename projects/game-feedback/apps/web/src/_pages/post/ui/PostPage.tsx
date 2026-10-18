'use client';
import { useI18n } from '@/shared/i18n';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { postDetailOptions, PostArticle, useRecordPostView } from '@/features/post';
import type { PostDetail } from '@/shared/api';
import { useSession } from '@/features/auth';
import { AuthorLink, UserBadges } from '@/features/user';
import { LoadingState, ServiceErrorBoundary } from '@/shared/ui';
import { usePostRead } from '../model/use-post-read.hook';
import { ContentActions } from './ContentActions';
import { PostAnswersSection } from './PostAnswersSection';
import { PostCommentsSection } from './PostCommentsSection';
import { BackLink } from '@/shared/navigation';
import { appRoutes } from '@game-feedback/bridge';
import { boardByKind } from '@/features/board';
import { VerificationPrompt } from '@/widgets/support';
import { StartChatLink } from '@/widgets/start-chat';
interface IPostPageProps {
  id: string;
  locale: string;
  initialDetail?: PostDetail;
  initialViewerId?: string;
}
export function PostPage(props: IPostPageProps) {
  const { t } = useI18n();
  const { session } = useSession();
  return (
    <ServiceErrorBoundary
      title={t('게시글')}
      resetKey={`${props.id}:${session.user?.id ?? 'anonymous'}`}
      recoveryAction={
        <BackLink href={appRoutes.feed(props.locale)} className="text-button">
          {t('피드로 돌아가기')}
        </BackLink>
      }
    >
      <PostContent {...props} />
    </ServiceErrorBoundary>
  );
}
function PostContent({ id, locale, initialDetail, initialViewerId }: IPostPageProps) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession(),
    detail = useQuery({
      ...postDetailOptions(id),
      refetchOnMount: 'always',
      throwOnError: true,
      initialData: session?.user?.id === initialViewerId ? initialDetail : undefined,
    });
  usePostRead(detail.data, session?.user?.id);
  useRecordPostView(id, !!detail.data, session.user?.id);
  const game = detail.data?.post.category.slug;
  const boardContext = boardByKind(detail.data?.post.board);
  useEffect(() => {
    if (!boardContext || !game) return;
    if (boardContext.kind === 'FEEDBACK' && game === 'clash-royale' && !params.get('board')) return;
    if (
      new URL(window.location.href).searchParams.get('board') === boardContext.slug &&
      (params.get('game') ?? 'clash-royale') === game
    )
      return;
    router.replace(appRoutes.post(locale, id, boardContext.kind, game), { scroll: false });
  }, [boardContext, game, id, locale, params, router]);
  if (!detail.data) return <LoadingState text={t('플레이 이야기를 불러오고 있어요')} />;
  const { post, answers, comments } = detail.data;
  const board = boardByKind(post.board);
  const isFeedback = board?.kind === 'FEEDBACK';
  return (
    <>
      <ServiceErrorBoundary title={t('게시글')} resetKey={id}>
        <PostArticle
          post={post}
          authorName={<AuthorLink author={post.author} locale={locale} />}
          authorContent={<UserBadges author={post.author} />}
          contactAction={
            post.author.id !== session.user?.id && (
              <StartChatLink
                userId={post.author.id}
                nickname={post.author.nickname}
                label={post.board === 'COACHING' ? t('코칭 상담') : undefined}
                appearance="button"
              />
            )
          }
          actions={
            <ContentActions type="POST" id={post.id} author={post.author} post={post} locale={locale} />
          }
        />
      </ServiceErrorBoundary>
      {post.author.id === session.user?.id && <VerificationPrompt />}
      {isFeedback && (
        <ServiceErrorBoundary title={t('답변')} resetKey={id}>
          <PostAnswersSection post={post} answers={answers} userId={session?.user?.id} locale={locale} />
        </ServiceErrorBoundary>
      )}
      <ServiceErrorBoundary title={t('댓글')} resetKey={id}>
        <PostCommentsSection post={post} comments={comments} locale={locale} />
      </ServiceErrorBoundary>
    </>
  );
}
