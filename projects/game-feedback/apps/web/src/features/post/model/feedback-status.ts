import { FeedbackStatusSchema } from '@game-feedback/contracts';

export const feedbackStatuses = [
  { value: undefined, label: '전체' },
  { value: 'WAITING', label: '답변 대기' },
  { value: 'ANSWERED', label: '답변 있음' },
] as const;

export function parseFeedbackStatus(value: unknown) {
  const parsed = FeedbackStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
