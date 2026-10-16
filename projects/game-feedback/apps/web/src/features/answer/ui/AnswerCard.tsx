import type { ReactNode } from 'react';
import { Check, Eye } from 'lucide-react';
import type { Answer } from '@/shared/api';
import { Avatar } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/date';
interface IAnswerCardProps {
  answer: Answer;
  authorContent?: ReactNode;
  actions?: ReactNode;
  helpfulControl?: ReactNode;
}
export function AnswerCard({ answer, authorContent, actions, helpfulControl }: IAnswerCardProps) {
  return (
    <article className={`answer-card ${answer.helpful ? 'helpful-answer' : ''}`}>
      {answer.helpful && (
        <div className="helpful-ribbon">
          <Check size={14} />
          요청자가 도움받은 피드백
        </div>
      )}
      <div className="detail-author">
        <Avatar name={answer.author.nickname} />
        <div>
          <strong>{answer.author.nickname}</strong>
          {authorContent}
          <span>
            {timeAgo(answer.createdAt)}
            {answer.readAt && (
              <>
                <span className="read-separator">·</span>
                <Eye size={11} />
                요청자 확인
              </>
            )}
          </span>
        </div>
        {actions}
      </div>
      <div className="prose-body">{answer.body}</div>
      <div className="answer-footer">
        {helpfulControl || (
          <span className="small muted">
            {answer.helpful ? '도움이 된 피드백이에요' : '경험을 나눠주셔서 고마워요'}
          </span>
        )}
      </div>
    </article>
  );
}
