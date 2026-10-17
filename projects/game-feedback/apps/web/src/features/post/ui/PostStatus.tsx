'use client';
import { useI18n } from '@/shared/i18n';
import { Check, MessageSquare } from 'lucide-react';
interface IPostStatusProps {
  answerCount: number;
  helpfulCount: number;
}
export function PostStatus({ answerCount, helpfulCount }: IPostStatusProps) {
  const { t } = useI18n();
  if (answerCount === 0) return <span className="status-pill waiting">{t('답변 기다리는 중')}</span>;
  if (helpfulCount > 0)
    return (
      <span className="status-pill resolved">
        <Check size={12} />
        {t('도움받았어요')}
      </span>
    );
  return (
    <span className="status-pill discussing">
      <MessageSquare size={12} />
      {t('함께 이야기 중')}
    </span>
  );
}
