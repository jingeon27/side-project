'use client';

import { MessageSquare } from 'lucide-react';

import { AnswerCard } from '@/features/answer';
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
  locale: string;
}
export function PostAnswersSection({ postId, postAuthorId, answers, locale }: IPostAnswersSectionProps) {
  const { t } = useI18n();
  const userId = useSession().session.user?.id;
  return (
    <section className="answers-section">
      <div className="section-title-row">
        <h2>
          {t('함께 나눈 피드백')}
          <span>{answers.length}</span>
        </h2>
        <span className="small muted">{t('플레이를 이야기하고, 서로를 존중해요')}</span>
      </div>
      {answers.length === 0 && (
        <div className="empty-answers">
          <MessageSquare size={26} />
          <strong>{t('첫 번째 피드백을 기다리고 있어요')}</strong>
          <p>{t('비슷한 경험이나 작은 팁부터 나눠주세요.')}</p>
        </div>
      )}
      {answers.map((answer) => (
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
      <AnswerComposer postId={postId} />
    </section>
  );
}
