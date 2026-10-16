'use client';
import { ThumbsUp } from 'lucide-react';
import type { Answer } from '@/shared/api';
import { ErrorNotice, useNotify } from '@/shared/ui';
import { useHelpfulAnswerMutation } from '@/features/answer';
interface IHelpfulAnswerButtonProps {
  answer: Answer;
}
export function HelpfulAnswerButton({ answer }: IHelpfulAnswerButtonProps) {
  const mutation = useHelpfulAnswerMutation(),
    notify = useNotify();
  return (
    <div>
      <button
        className={`helpful-button ${answer.helpful ? 'selected' : ''}`}
        disabled={mutation.isPending}
        onClick={() =>
          mutation.mutate(
            { id: answer.id, helpful: !answer.helpful },
            {
              onSuccess: () =>
                notify(answer.helpful ? '도움됨 표시를 취소했어요.' : '도움이 된 피드백에 마음을 전했어요.'),
            },
          )
        }
      >
        <ThumbsUp size={15} />
        {answer.helpful ? '도움됨 취소' : '도움이 됐어요'}
      </button>
      <ErrorNotice message={mutation.error?.message} />
    </div>
  );
}
