'use client';

import { MessageSquare } from 'lucide-react';

import { AnswerCard } from '@/features/answer';
import { AuthorLink, UserBadges } from '@/features/user';
import type { Answer, Post } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

import { AnswerComposer } from './AnswerComposer';
import { ContentActions } from './ContentActions';
import { HelpfulAnswerButton } from './HelpfulAnswerButton';

interface IPostAnswersSectionProps {
  post: Post;
  answers: Answer[];
  userId?: string;
  locale: string;
}
export function PostAnswersSection({ post, answers, userId, locale }: IPostAnswersSectionProps) {
  const { t } = useI18n();
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
          actions={
            <ContentActions
              type="ANSWER"
              id={answer.id}
              author={answer.author}
              body={answer.body}
              post={post}
              locale={locale}
            />
          }
          helpfulControl={
            post.author.id === userId && answer.author.id !== userId ? (
              <HelpfulAnswerButton answer={answer} />
            ) : undefined
          }
        />
      ))}
      <AnswerComposer postId={post.id} />
    </section>
  );
}
