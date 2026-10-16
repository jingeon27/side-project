import { Check, MessageSquare } from 'lucide-react';
interface IPostStatusProps {
  answerCount: number;
  helpfulCount: number;
}
export function PostStatus({ answerCount, helpfulCount }: IPostStatusProps) {
  if (answerCount === 0)
    return (
      <span className="status-pill waiting">
        <span />
        답변 기다리는 중
      </span>
    );
  if (helpfulCount > 0)
    return (
      <span className="status-pill resolved">
        <Check size={12} />
        도움받았어요
      </span>
    );
  return (
    <span className="status-pill discussing">
      <MessageSquare size={12} />
      함께 이야기 중
    </span>
  );
}
