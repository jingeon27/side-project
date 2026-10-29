import { FeedbackStatusSchema } from '@game-feedback/contracts';

export function parseFeedbackStatus(value: unknown) {
  const parsed = FeedbackStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
