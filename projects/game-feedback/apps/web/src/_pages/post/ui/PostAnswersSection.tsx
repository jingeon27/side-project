'use client';

import { useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';
import { MessageSquare } from 'lucide-react';

import { Button } from '@side/design-system';

import { AnswerCard, laterAnswerOptions } from '@/features/answer';
import { useSession } from '@/features/auth';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Answer } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import { AnswerActions } from './AnswerActions';
import { AnswerComposer } from './AnswerComposer';
import { HelpfulAnswerButton } from './HelpfulAnswerButton';

interface IPostAnswersSectionProps {
  postId: string;
  postAuthorId: string;
  answers: Answer[];
  /** 상세 첫 페이지 다음 답변의 커서. 없으면 모두 받은 상태다. */
  cursor: string | null;
  locale: string;
}
export function PostAnswersSection({
  postId,
  postAuthorId,
  answers,
  cursor,
  locale,
}: IPostAnswersSectionProps) {
  const { t } = useI18n();
  const userId = useSession().session.user?.id;
  const [showLater, setShowLater] = useState(false);
  const later = useInfiniteQuery({ ...laterAnswerOptions(postId, cursor), enabled: showLater && !!cursor });
  // 페이지는 도움됨 → 오래된 순으로 이어지므로 받은 순서대로 뒤에 붙인다.
  const loaded = uniqBy(
    [...answers, ...(later.data?.pages ?? []).flatMap((page) => page.items)],
    (answer) => answer.id,
  );
  const hasLater = !!cursor && (!showLater || later.isPending || later.isError || later.hasNextPage);

  function handleShowLater() {
    if (!showLater) {
      setShowLater(true);
      return;
    }
    if (!later.data) {
      void later.refetch();
      return;
    }
    void later.fetchNextPage();
  }

  return (
    <section className="answers-section">
      <div className="section-title-row">
        <h2>
          {t('함께 나눈 피드백')}
          <span>{hasLater ? t('{count}개 이상', { count: loaded.length }) : loaded.length}</span>
        </h2>
        <span className="small muted">{t('플레이를 이야기하고, 서로를 존중해요')}</span>
      </div>
      {loaded.length === 0 && !hasLater && (
        <div className="empty-answers">
          <MessageSquare size={26} />
          <strong>{t('첫 번째 피드백을 기다리고 있어요')}</strong>
          <p>{t('비슷한 경험이나 작은 팁부터 나눠주세요.')}</p>
        </div>
      )}
      {loaded.map((answer) => (
        <AnswerCard
          key={answer.id}
          answer={answer}
          authorName={<AuthorLink author={answer.author} locale={locale} />}
          authorContent={<UserBadges author={answer.author} />}
          actions={<AnswerActions answer={answer} />}
          helpfulControl={
            postAuthorId === userId && answer.author.id !== userId ? (
              <HelpfulAnswerButton answer={answer} />
            ) : undefined
          }
        />
      ))}
      {hasLater && (
        <div className="answers-later">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={later.isFetching}
            onClick={handleShowLater}
          >
            {later.isFetching ? t('답변을 더 불러오고 있어요') : t('답변 더 보기')}
          </Button>
          {later.isError && !later.isFetching && (
            <p role="alert">{t('답변을 더 불러오지 못했어요. 다시 시도해주세요.')}</p>
          )}
        </div>
      )}
      <AnswerComposer postId={postId} />
    </section>
  );
}
