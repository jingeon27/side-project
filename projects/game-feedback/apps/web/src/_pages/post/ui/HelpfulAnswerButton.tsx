'use client';
import { useI18n } from '@/shared/i18n';
import { ThumbsUp } from 'lucide-react';
import type { Answer } from '@/shared/api';
import { ErrorNotice, useNotify } from '@/shared/ui';
import { useHelpfulAnswerMutation } from '@/features/answer';
import { m, useMotionPreference } from '@/shared/motion';
interface IHelpfulAnswerButtonProps {
  answer: Answer;
}
export function HelpfulAnswerButton({ answer }: IHelpfulAnswerButtonProps) {
  const { t } = useI18n();
  const mutation = useHelpfulAnswerMutation(),
    notify = useNotify();
  const reducedMotion = useMotionPreference();
  return (
    <div>
      <m.button
        type="button"
        tabIndex={0}
        className={`helpful-button ${answer.helpful ? 'selected' : ''}`}
        aria-pressed={answer.helpful}
        disabled={mutation.isPending}
        whileTap={reducedMotion || mutation.isPending ? undefined : { scale: 0.96 }}
        onClick={() =>
          mutation.mutate(
            { id: answer.id, helpful: !answer.helpful },
            {
              onSuccess: () =>
                notify(
                  answer.helpful ? t('도움됨 표시를 취소했어요.') : t('도움이 된 피드백에 마음을 전했어요.'),
                ),
            },
          )
        }
      >
        <m.span
          aria-hidden="true"
          className="helpful-icon"
          initial={false}
          animate={
            answer.helpful && !reducedMotion
              ? { scale: [1, 1.2, 1], rotate: [0, -12, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: reducedMotion ? 0 : 0.28 }}
        >
          <ThumbsUp size={15} />
        </m.span>
        {answer.helpful ? t('도움됨 취소') : t('도움이 됐어요')}
      </m.button>
      <ErrorNotice message={mutation.error?.message} />
    </div>
  );
}
