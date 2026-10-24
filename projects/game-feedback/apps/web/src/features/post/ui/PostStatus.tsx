'use client';

import { Check, MessageSquare } from 'lucide-react';

import { useI18n } from '@/shared/i18n';

interface IPostStatusProps {
  answerCount: number;
  helpfulCount: number;
}
export function PostStatus({ answerCount, helpfulCount }: IPostStatusProps) {
  const { t } = useI18n();
  if (answerCount === 0) return <span className="status-pill waiting">{t('답변 대기')}</span>;
  if (helpfulCount > 0)
    return (
      <span className="status-pill resolved">
        <Check size={12} />
        {t('도움됨')}
      </span>
    );
  return (
    <span className="status-pill discussing">
      <MessageSquare size={12} />
      {t('답변 있음')}
    </span>
  );
}
